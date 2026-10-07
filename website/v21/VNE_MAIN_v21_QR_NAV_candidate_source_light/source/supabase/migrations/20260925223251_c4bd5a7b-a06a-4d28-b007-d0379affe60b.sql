-- Разрешённая текущая версия согласия хранится на сервере БД, а не приходит произвольной строкой.
create or replace function private.current_consent_version() returns text
language sql immutable set search_path to '' as $$ select 'draft-2026-09'::text $$;
revoke all on function private.current_consent_version() from public, anon, authenticated;

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
  perform private.log_app(_app, r.status, v_to, null, 'application.guest_' || _action);
  return v_to;
end $$;

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
    public_message = case when _action = 'request_info' then trim(_public_message) else null end where id = _app;
  perform private.log_app(_app, r.status, v_to, case when _action = 'request_info' then trim(_public_message) end, 'application.' || _action);
  return v_to;
end $$;

create or replace function private.submit_application(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_key_event uuid; v_email text; v_recent int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if _idempotency is null or _event is null then raise exception 'invalid request' using errcode = '22023'; end if;
  select id, event_id into v_id, v_key_event from public.applications where user_id = v_uid and idempotency_key = _idempotency;
  if v_id is not null then
    if v_key_event <> _event then raise exception 'idempotency key reused with different payload' using errcode = 'PT422'; end if;
    return v_id;
  end if;
  select id into v_id from public.applications where user_id = v_uid and event_id = _event;
  if v_id is not null then return v_id; end if;
  if coalesce(char_length(trim(_display_name)), 0) not between 1 and 80 or _age_confirmed is not true
     or _consent_version is distinct from private.current_consent_version() then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  if not exists (select 1 from public.events e where e.id = _event and e.status = 'published') then
    raise exception 'event unavailable' using errcode = '22023';
  end if;
  select count(*) into v_recent from public.applications where user_id = v_uid and created_at > now() - interval '1 hour';
  if v_recent >= 10 then raise exception 'rate limited' using errcode = 'P0001'; end if;
  select email into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  if v_email is null then raise exception 'contact unconfirmed' using errcode = '42501'; end if;
  insert into public.applications(event_id, user_id, display_name, contact_email, age_confirmed, consent_version, consent_at, consent_method, idempotency_key)
    values (_event, v_uid, trim(_display_name), v_email, true, private.current_consent_version(), now(), 'web_form_checkbox', _idempotency)
    on conflict (event_id, user_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.applications where user_id = v_uid and event_id = _event;
    return v_id;
  end if;
  perform private.log_app(v_id, null, 'submitted', null, 'application.submit');
  return v_id;
end $$;