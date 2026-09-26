alter type public.application_status add value if not exists 'under_review';
alter type public.application_status add value if not exists 'needs_info';
alter type public.application_status add value if not exists 'waitlisted';
commit;
begin;

alter table public.applications
  add column if not exists display_name text,
  add column if not exists contact_email text,
  add column if not exists age_confirmed boolean not null default false,
  add column if not exists consent_version text,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_method text,
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists guest_reply text,
  add column if not exists public_message text,
  add column if not exists version integer not null default 1,
  add column if not exists idempotency_key uuid;
alter table public.applications
  add constraint applications_display_name_len check (display_name is null or char_length(display_name) between 1 and 80),
  add constraint applications_reply_len check (guest_reply is null or char_length(guest_reply) <= 1000),
  add constraint applications_public_message_len check (public_message is null or char_length(public_message) <= 500),
  add constraint applications_consent_method check (consent_method is null or consent_method in ('web_form_checkbox'));
create unique index if not exists applications_user_idem on public.applications(user_id, idempotency_key) where idempotency_key is not null;
create index if not exists applications_event_status on public.applications(event_id, status, created_at desc);

alter table public.membership_requests
  add column if not exists consent_version text,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_method text;

alter table private.outbox drop constraint outbox_status_check;
alter table private.outbox add constraint outbox_status_check check (status in ('pending','sent','failed','held'));

create table public.application_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.applications(id) on delete cascade,
  at timestamptz not null default now(),
  from_status public.application_status,
  to_status public.application_status not null,
  public_message text check (public_message is null or char_length(public_message) <= 500)
);
create index on public.application_events(application_id, at);
revoke all on public.application_events from public, anon, authenticated;
grant select on public.application_events to authenticated;
grant all on public.application_events to service_role;
alter table public.application_events enable row level security;
create policy "app events: guest reads own" on public.application_events for select to authenticated
  using (exists (select 1 from public.applications a where a.id = application_id and a.user_id = auth.uid()));
create policy "app events: staff reads assigned" on public.application_events for select to authenticated
  using (private.staff_session_ok() and exists (select 1 from public.applications a where a.id = application_id
    and private.has_role(array['owner','admin','moderator']::public.staff_role[], a.event_id)));

-- Гость пишет только через RPC.
drop policy if exists "applications: guest creates own submitted" on public.applications;
drop policy if exists "applications: guest withdraws own" on public.applications;
revoke insert, update, delete on public.applications from public, anon, authenticated;
revoke all on public.applications from anon;
grant select on public.applications to authenticated;
grant all on public.applications to service_role;

create or replace function private.log_app(_app uuid, _from public.application_status, _to public.application_status, _msg text, _action text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_corr uuid := gen_random_uuid();
begin
  insert into public.application_events(application_id, from_status, to_status, public_message) values (_app, _from, _to, _msg);
  insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
    values (auth.uid(), _action, 'application', _app, 'ok', v_corr, jsonb_build_object('from', _from, 'to', _to));
  insert into private.outbox(topic, payload, status)
    values ('application.status_changed', jsonb_build_object('application_id', _app, 'to', _to, 'correlation_id', v_corr), 'held');
end $$;
revoke execute on function private.log_app(uuid, public.application_status, public.application_status, text, text) from public, anon, authenticated;

create or replace function private.submit_application(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid; v_email text; v_recent int;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '42501'; end if;
  if _idempotency is null then raise exception 'invalid request' using errcode = '22023'; end if;
  select id into v_id from public.applications where user_id = v_uid and (idempotency_key = _idempotency or event_id = _event);
  if v_id is not null then return v_id; end if;
  if coalesce(char_length(trim(_display_name)), 0) not between 1 and 80 or _age_confirmed is not true
     or coalesce(_consent_version, '') !~ '^[a-z0-9._-]{3,40}$' then
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
    values (_event, v_uid, trim(_display_name), v_email, true, _consent_version, now(), 'web_form_checkbox', _idempotency)
    on conflict (event_id, user_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.applications where user_id = v_uid and event_id = _event;
    return v_id;
  end if;
  perform private.log_app(v_id, null, 'submitted', null, 'application.submit');
  return v_id;
end $$;

create or replace function private.guest_application_action(_app uuid, _action text, _expected_version int, _reply text)
returns public.application_status language plpgsql security definer set search_path = '' as $$
declare r public.applications; v_to public.application_status;
begin
  select * into r from public.applications where id = _app and user_id = auth.uid() for update;
  if r.id is null then raise exception 'forbidden' using errcode = '42501'; end if;
  if r.version <> _expected_version then raise exception 'stale' using errcode = '40001'; end if;
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
  select * into r from public.applications where id = _app for update;
  if r.version <> _expected_version then raise exception 'stale' using errcode = '40001'; end if;
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

revoke execute on function private.submit_application(uuid, text, boolean, text, uuid) from public, anon;
revoke execute on function private.guest_application_action(uuid, text, int, text) from public, anon;
revoke execute on function private.moderate_application(uuid, text, int, text) from public, anon;
grant execute on function private.submit_application(uuid, text, boolean, text, uuid) to authenticated;
grant execute on function private.guest_application_action(uuid, text, int, text) to authenticated;
grant execute on function private.moderate_application(uuid, text, int, text) to authenticated;

create function public.submit_application(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid)
returns uuid language sql security invoker set search_path = '' as $$ select private.submit_application(_event, _display_name, _age_confirmed, _consent_version, _idempotency) $$;
create function public.guest_application_action(_app uuid, _action text, _expected_version int, _reply text default null)
returns public.application_status language sql security invoker set search_path = '' as $$ select private.guest_application_action(_app, _action, _expected_version, _reply) $$;
create function public.moderate_application(_app uuid, _action text, _expected_version int, _public_message text default null)
returns public.application_status language sql security invoker set search_path = '' as $$ select private.moderate_application(_app, _action, _expected_version, _public_message) $$;
revoke execute on function public.submit_application(uuid, text, boolean, text, uuid) from public, anon;
revoke execute on function public.guest_application_action(uuid, text, int, text) from public, anon;
revoke execute on function public.moderate_application(uuid, text, int, text) from public, anon;
grant execute on function public.submit_application(uuid, text, boolean, text, uuid) to authenticated;
grant execute on function public.guest_application_action(uuid, text, int, text) to authenticated;
grant execute on function public.moderate_application(uuid, text, int, text) to authenticated;

-- Согласие публичной формы членства: версия, время, способ.
drop function public.submit_membership_request(text, text, text, text, text);
create function public.submit_membership_request(_email text, _display_name text, _telegram_username text, _event_slug text, _identifier_hash text, _consent_version text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := now(); v_attempts integer;
begin
  if _identifier_hash is null or char_length(_identifier_hash) <> 64 or coalesce(_consent_version,'') !~ '^[a-z0-9._-]{3,40}$' then
    raise exception 'invalid request' using errcode = '22023';
  end if;
  insert into private.membership_request_limits(identifier_hash, window_started_at, attempts)
  values (_identifier_hash, v_now, 1)
  on conflict (identifier_hash) do update
    set window_started_at = case when private.membership_request_limits.window_started_at < v_now - interval '1 hour' then v_now else private.membership_request_limits.window_started_at end,
        attempts = case when private.membership_request_limits.window_started_at < v_now - interval '1 hour' then 1 else private.membership_request_limits.attempts + 1 end
  returning attempts into v_attempts;
  if v_attempts > 5 then raise exception 'rate limited' using errcode = 'P0001'; end if;
  insert into public.membership_requests(email, display_name, telegram_username, event_slug, consent_version, consent_at, consent_method)
  values (lower(trim(_email)), trim(_display_name), trim(leading '@' from _telegram_username), nullif(trim(_event_slug), ''), _consent_version, v_now, 'web_form_checkbox')
  on conflict do nothing;
end $$;
revoke execute on function public.submit_membership_request(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_membership_request(text, text, text, text, text, text) to service_role;