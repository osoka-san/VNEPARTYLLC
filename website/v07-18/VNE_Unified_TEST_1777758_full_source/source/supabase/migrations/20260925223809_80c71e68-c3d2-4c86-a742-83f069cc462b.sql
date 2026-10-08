-- 1) Ответ гостя сохраняется в хронологии отдельно от сообщения команды.
alter table public.application_events add column if not exists guest_message text;

create or replace function private.log_app2(_app uuid, _from public.application_status, _to public.application_status, _msg text, _guest text, _action text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_corr uuid := gen_random_uuid();
begin
  insert into public.application_events(application_id, from_status, to_status, public_message, guest_message) values (_app, _from, _to, _msg, _guest);
  insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
    values (auth.uid(), _action, 'application', _app, 'ok', v_corr, jsonb_build_object('from', _from, 'to', _to));
  insert into private.outbox(topic, payload, status)
    values ('application.status_changed', jsonb_build_object('application_id', _app, 'to', _to, 'correlation_id', v_corr), 'held');
end $$;
revoke all on function private.log_app2(uuid, public.application_status, public.application_status, text, text, text) from public, anon, authenticated;

create or replace function private.guest_application_action(_app uuid, _action text, _expected_version int, _reply text)
returns public.application_status language plpgsql security definer set search_path = '' as $$
declare r public.applications; v_to public.application_status;
begin
  if _expected_version is null or _expected_version < 1 then raise exception 'version required' using errcode = '22023'; end if;
  select * into r from public.applications where id = _app and user_id = auth.uid() for update;
  if r.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.version is distinct from _expected_version then raise exception 'stale' using errcode = 'PT409'; end if;
  if _action = 'withdraw' and r.status in ('submitted','under_review','needs_info','waitlisted') then v_to := 'withdrawn';
  elsif _action = 'reply' and r.status = 'needs_info' and coalesce(char_length(trim(_reply)),0) between 1 and 1000 then v_to := 'under_review';
  else raise exception 'invalid transition' using errcode = '22023'; end if;
  update public.applications set status = v_to, version = version + 1, updated_at = now(),
    guest_reply = case when _action = 'reply' then trim(_reply) else guest_reply end where id = _app;
  perform private.log_app2(_app, r.status, v_to, null, case when _action = 'reply' then trim(_reply) end, 'application.guest_' || _action);
  return v_to;
end $$;

-- Новое уточнение очищает старый ответ в карточке (он остаётся в хронологии).
create or replace function private.moderate_application(_app uuid, _action text, _expected_version int, _public_message text)
returns public.application_status language plpgsql security definer set search_path = '' as $$
declare v_event uuid; r public.applications; v_to public.application_status; v_ok boolean;
begin
  if not private.staff_session_ok() then raise exception 'forbidden' using errcode = '42501'; end if;
  select event_id into v_event from public.applications where id = _app;
  if v_event is null or not private.has_role(array['owner','admin','moderator']::public.staff_role[], v_event) then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if _expected_version is null or _expected_version < 1 then raise exception 'version required' using errcode = '22023'; end if;
  select * into r from public.applications where id = _app for update;
  if r.version is distinct from _expected_version then raise exception 'stale' using errcode = 'PT409'; end if;
  v_to := case _action when 'take' then 'under_review' when 'request_info' then 'needs_info' when 'approve' then 'approved'
    when 'reject' then 'rejected' when 'waitlist' then 'waitlisted' end::public.application_status;
  v_ok := case _action
    when 'take' then r.status = 'submitted'
    when 'request_info' then r.status in ('submitted','under_review')
    when 'approve' then r.status in ('submitted','under_review','waitlisted')
    when 'reject' then r.status in ('submitted','under_review','needs_info','waitlisted')
    when 'waitlist' then r.status in ('submitted','under_review')
    else false end;
  if not coalesce(v_ok, false) then raise exception 'invalid transition' using errcode = '22023'; end if;
  if _action = 'request_info' and coalesce(char_length(trim(_public_message)),0) not between 1 and 500 then
    raise exception 'message required' using errcode = '22023'; end if;
  update public.applications set status = v_to, version = version + 1, reviewed_by = auth.uid(), updated_at = now(),
    public_message = case when _action = 'request_info' then trim(_public_message) else null end,
    guest_reply = case when _action = 'request_info' then null else guest_reply end
  where id = _app;
  perform private.log_app2(_app, r.status, v_to, case when _action = 'request_info' then trim(_public_message) end, null, 'application.' || _action);
  return v_to;
end $$;

-- 3) Узкое редактирование: только имя обращения, только владелец, только нефинальные статусы, с версией и аудитом.
create or replace function private.guest_update_display_name(_app uuid, _name text, _expected_version int)
returns integer language plpgsql security definer set search_path = '' as $$
declare r public.applications; v_new int;
begin
  if _expected_version is null or _expected_version < 1 then raise exception 'version required' using errcode = '22023'; end if;
  if coalesce(char_length(trim(_name)), 0) not between 1 and 80 then raise exception 'invalid name' using errcode = '22023'; end if;
  select * into r from public.applications where id = _app and user_id = auth.uid() for update;
  if r.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.version is distinct from _expected_version then raise exception 'stale' using errcode = 'PT409'; end if;
  if r.status not in ('submitted','under_review','needs_info','waitlisted') then raise exception 'invalid transition' using errcode = '22023'; end if;
  update public.applications set display_name = trim(_name), version = version + 1, updated_at = now() where id = _app returning version into v_new;
  insert into private.audit_log(actor, action, object_type, object_id, result, details)
    values (auth.uid(), 'application.guest_rename', 'application', _app, 'ok', jsonb_build_object('field', 'display_name'));
  return v_new;
end $$;
revoke all on function private.guest_update_display_name(uuid, text, int) from public, anon;
grant execute on function private.guest_update_display_name(uuid, text, int) to authenticated;
create or replace function public.guest_update_display_name(_app uuid, _name text, _expected_version int)
returns integer language sql security invoker set search_path = '' as $$ select private.guest_update_display_name(_app, _name, _expected_version) $$;
revoke all on function public.guest_update_display_name(uuid, text, int) from public, anon;
grant execute on function public.guest_update_display_name(uuid, text, int) to authenticated;

-- 4) Снимаем все прямые INSERT/UPDATE, включая колоночные, у anon/authenticated.
do $$
declare c record;
begin
  revoke insert, update, delete, truncate on public.applications, public.application_events from anon, authenticated;
  for c in select column_name, table_name from information_schema.columns
           where table_schema = 'public' and table_name in ('applications','application_events') loop
    execute format('revoke insert (%I), update (%I) on public.%I from anon, authenticated', c.column_name, c.column_name, c.table_name);
  end loop;
end $$;