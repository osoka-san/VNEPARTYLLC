create type public.membership_request_status as enum ('pending', 'approved', 'rejected');

create table public.membership_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  display_name text not null,
  telegram_username text not null,
  event_slug text,
  status public.membership_request_status not null default 'pending',
  invited_user_id uuid,
  invited_at timestamptz,
  invite_error text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint membership_requests_email_format check (
    char_length(email) between 3 and 254 and email = lower(email) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint membership_requests_display_name_length check (char_length(display_name) between 1 and 80),
  constraint membership_requests_telegram_format check (telegram_username ~ '^[A-Za-z][A-Za-z0-9_]{4,31}$'),
  constraint membership_requests_event_slug_format check (event_slug is null or event_slug ~ '^[a-z0-9-]{3,64}$'),
  constraint membership_requests_review_shape check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status in ('approved', 'rejected') and reviewed_by is not null and reviewed_at is not null)
  ),
  constraint membership_requests_invite_shape check (
    (invited_at is null and invited_user_id is null)
    or (status = 'approved' and invited_at is not null and invited_user_id is not null)
  )
);
revoke all on public.membership_requests from public, anon, authenticated;
grant select on public.membership_requests to authenticated;
grant all on public.membership_requests to service_role;
alter table public.membership_requests enable row level security;

create unique index membership_requests_pending_email_uq
  on public.membership_requests (lower(email)) where status = 'pending';
create index membership_requests_status_created_idx
  on public.membership_requests (status, created_at desc);

create policy "membership requests: staff read" on public.membership_requests
  for select to authenticated
  using (
    private.staff_session_ok()
    and private.has_role(array['owner','admin','moderator']::public.staff_role[])
  );

create table private.membership_request_limits (
  identifier_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 1 check (attempts between 1 and 1000)
);
revoke all on private.membership_request_limits from public, anon, authenticated;
grant all on private.membership_request_limits to service_role;

create function public.submit_membership_request(
  _email text,
  _display_name text,
  _telegram_username text,
  _event_slug text,
  _identifier_hash text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_attempts integer;
begin
  if _identifier_hash is null or char_length(_identifier_hash) <> 64 then
    raise exception 'invalid request' using errcode = '22023';
  end if;

  insert into private.membership_request_limits(identifier_hash, window_started_at, attempts)
  values (_identifier_hash, v_now, 1)
  on conflict (identifier_hash) do update
    set window_started_at = case
          when private.membership_request_limits.window_started_at < v_now - interval '1 hour' then v_now
          else private.membership_request_limits.window_started_at
        end,
        attempts = case
          when private.membership_request_limits.window_started_at < v_now - interval '1 hour' then 1
          else private.membership_request_limits.attempts + 1
        end
  returning attempts into v_attempts;

  if v_attempts > 5 then
    raise exception 'rate limited' using errcode = 'P0001';
  end if;

  insert into public.membership_requests(email, display_name, telegram_username, event_slug)
  values (lower(trim(_email)), trim(_display_name), trim(leading '@' from _telegram_username), nullif(trim(_event_slug), ''))
  on conflict do nothing;
end
$$;
revoke execute on function public.submit_membership_request(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_membership_request(text, text, text, text, text) to service_role;

create function public.review_membership_request(
  _request uuid,
  _decision public.membership_request_status
) returns public.membership_request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.membership_request_status;
  v_corr uuid := gen_random_uuid();
begin
  if _decision not in ('approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  if not private.staff_session_ok()
     or not private.has_role(array['owner','admin','moderator']::public.staff_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select status into v_status
  from public.membership_requests
  where id = _request
  for update;

  if v_status is null then
    raise exception 'not found' using errcode = 'P0002';
  end if;
  if v_status <> 'pending' then
    return v_status;
  end if;

  update public.membership_requests
  set status = _decision,
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      updated_at = now()
  where id = _request and status = 'pending';

  insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
  values (auth.uid(), 'membership_request.review', 'membership_request', _request, 'ok', v_corr,
    jsonb_build_object('decision', _decision));

  return _decision;
end
$$;
revoke execute on function public.review_membership_request(uuid, public.membership_request_status) from public, anon;
grant execute on function public.review_membership_request(uuid, public.membership_request_status) to authenticated;

create function public.record_membership_invite(
  _request uuid,
  _invited_user uuid,
  _invite_error text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.membership_requests
  set invited_user_id = case when _invite_error is null then _invited_user else invited_user_id end,
      invited_at = case when _invite_error is null then coalesce(invited_at, now()) else invited_at end,
      invite_error = left(_invite_error, 240),
      updated_at = now()
  where id = _request and status = 'approved';
end
$$;
revoke execute on function public.record_membership_invite(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.record_membership_invite(uuid, uuid, text) to service_role;