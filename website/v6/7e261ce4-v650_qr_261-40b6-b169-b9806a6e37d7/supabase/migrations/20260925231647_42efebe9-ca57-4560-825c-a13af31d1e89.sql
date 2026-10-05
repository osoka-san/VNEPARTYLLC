-- Идемпотентность подачи заявки по неизменяемому отпечатку исходной команды.
alter table public.applications add column if not exists submit_fingerprint text;

create or replace function private.applications_fingerprint_immutable()
returns trigger language plpgsql set search_path to '' as $$
begin
  if new.submit_fingerprint is distinct from old.submit_fingerprint then
    raise exception 'submit_fingerprint is immutable' using errcode = '42501';
  end if;
  if new.idempotency_key is distinct from old.idempotency_key then
    raise exception 'idempotency_key is immutable' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists applications_fingerprint_immutable on public.applications;
create trigger applications_fingerprint_immutable before update on public.applications
  for each row execute function private.applications_fingerprint_immutable();

create or replace function private.submit_fingerprint(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text)
returns text language sql immutable set search_path to '' as $$
  select encode(sha256(convert_to(concat_ws(chr(31), 'v1', _event::text, coalesce(trim(_display_name), ''),
    coalesce(_age_confirmed::text, 'null'), coalesce(_consent_version, '')), 'UTF8')), 'hex')
$$;
revoke all on function private.submit_fingerprint(uuid, text, boolean, text) from public, anon, authenticated;

create or replace function private.submit_application_v2(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare v_uid uuid := auth.uid(); r record; v_fp text; v_id uuid; v_email text; v_recent int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if _idempotency is null or _event is null then raise exception 'invalid request' using errcode = '22023'; end if;
  v_fp := private.submit_fingerprint(_event, _display_name, _age_confirmed, _consent_version);
  select id, event_id, submit_fingerprint, display_name, status into r
    from public.applications where user_id = v_uid and idempotency_key = _idempotency;
  if found then
    if r.event_id <> _event or (r.submit_fingerprint is not null and r.submit_fingerprint <> v_fp) then
      raise exception 'idempotency key reused with different payload' using errcode = 'PT422';
    end if;
    return jsonb_build_object('id', r.id, 'outcome', 'replay', 'display_name', r.display_name, 'status', r.status);
  end if;
  select id, display_name, status into r from public.applications where user_id = v_uid and event_id = _event;
  if found then
    return jsonb_build_object('id', r.id, 'outcome', 'existing', 'display_name', r.display_name, 'status', r.status);
  end if;
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
  insert into public.applications(event_id, user_id, display_name, contact_email, age_confirmed, consent_version, consent_at, consent_method, idempotency_key, submit_fingerprint)
    values (_event, v_uid, trim(_display_name), v_email, true, private.current_consent_version(), now(), 'web_form_checkbox', _idempotency, v_fp)
    on conflict do nothing returning id into v_id;
  if v_id is null then
    select id, event_id, submit_fingerprint, display_name, status into r
      from public.applications where user_id = v_uid and idempotency_key = _idempotency;
    if found then
      if r.submit_fingerprint is distinct from v_fp then
        raise exception 'idempotency key reused with different payload' using errcode = 'PT422'; end if;
      return jsonb_build_object('id', r.id, 'outcome', 'replay', 'display_name', r.display_name, 'status', r.status);
    end if;
    select id, display_name, status into r from public.applications where user_id = v_uid and event_id = _event;
    return jsonb_build_object('id', r.id, 'outcome', 'existing', 'display_name', r.display_name, 'status', r.status);
  end if;
  perform private.log_app(v_id, null, 'submitted', null, 'application.submit');
  return jsonb_build_object('id', v_id, 'outcome', 'created', 'display_name', trim(_display_name), 'status', 'submitted');
end $$;
revoke all on function private.submit_application_v2(uuid, text, boolean, text, uuid) from public, anon;
grant execute on function private.submit_application_v2(uuid, text, boolean, text, uuid) to authenticated;

create or replace function private.submit_application(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid)
returns uuid language sql security invoker set search_path to '' as $$
  select (private.submit_application_v2(_event, _display_name, _age_confirmed, _consent_version, _idempotency)->>'id')::uuid
$$;

create or replace function public.submit_application_v2(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid)
returns jsonb language sql security invoker set search_path to '' as $$
  select private.submit_application_v2(_event, _display_name, _age_confirmed, _consent_version, _idempotency)
$$;
revoke all on function public.submit_application_v2(uuid, text, boolean, text, uuid) from public, anon;
grant execute on function public.submit_application_v2(uuid, text, boolean, text, uuid) to authenticated;