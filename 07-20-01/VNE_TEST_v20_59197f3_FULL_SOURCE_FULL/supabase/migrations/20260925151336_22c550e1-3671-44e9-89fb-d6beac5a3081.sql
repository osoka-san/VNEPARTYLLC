create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.staff_role as enum ('owner', 'admin', 'editor', 'moderator', 'scanner', 'shift_lead');
create type public.event_status as enum ('draft', 'published', 'archived');
create type public.application_status as enum ('submitted', 'withdrawn', 'approved', 'rejected');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now()
);
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,64}$'),
  title text not null check (char_length(title) between 1 and 120),
  status public.event_status not null default 'draft',
  created_at timestamptz not null default now()
);
revoke all on public.events from public, anon, authenticated;
grant select on public.events to anon, authenticated;
grant all on public.events to service_role;
alter table public.events enable row level security;

create table public.staff_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.staff_role not null,
  event_id uuid references public.events (id) on delete cascade,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  revoked_at timestamptz,
  granted_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  constraint event_scoped_roles check (
    (role in ('moderator', 'scanner', 'shift_lead') and event_id is not null)
    or (role in ('owner', 'admin', 'editor') and event_id is null)
  ),
  constraint valid_window check (valid_until is null or valid_until > valid_from)
);
create index staff_assignments_user_idx on public.staff_assignments (user_id) where revoked_at is null;
revoke all on public.staff_assignments from public, anon, authenticated;
grant select on public.staff_assignments to authenticated;
grant all on public.staff_assignments to service_role;
alter table public.staff_assignments enable row level security;

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete restrict,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  status public.application_status not null default 'submitted',
  note text check (char_length(note) <= 1000),
  reviewed_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, user_id)
);
revoke all on public.applications from public, anon, authenticated;
grant select on public.applications to authenticated;
grant insert (event_id, note) on public.applications to authenticated;
grant update (status) on public.applications to authenticated;
grant all on public.applications to service_role;
alter table public.applications enable row level security;

create table private.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  object_type text not null,
  object_id uuid,
  result text not null check (result in ('ok', 'noop', 'denied')),
  correlation_id uuid not null default gen_random_uuid(),
  details jsonb not null default '{}'::jsonb
);
create table private.outbox (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  topic text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0
);
revoke all on private.audit_log, private.outbox from public, anon, authenticated;
revoke all on sequence private.audit_log_id_seq, private.outbox_id_seq from public, anon, authenticated;
grant all on private.audit_log, private.outbox to service_role;

create function private.has_role(_roles public.staff_role[], _event uuid default null)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff_assignments s
    where s.user_id = auth.uid() and s.role = any (_roles) and s.revoked_at is null
      and s.valid_from <= now() and (s.valid_until is null or s.valid_until > now())
      and (s.event_id is null or s.event_id = _event)
  )
$$;
create function private.staff_session_ok() returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (
       select 1 from auth.sessions s
       where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
         and s.user_id = auth.uid()
         and (s.not_after is null or s.not_after > now())
     )
$$;
revoke execute on function private.has_role(public.staff_role[], uuid) from public, anon;
revoke execute on function private.staff_session_ok() from public, anon;
grant execute on function private.has_role(public.staff_role[], uuid) to authenticated;
grant execute on function private.staff_session_ok() to authenticated;

create policy "profiles: read own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "events: public read published" on public.events for select to anon, authenticated
  using (status = 'published');
create policy "events: staff read assigned" on public.events for select to authenticated
  using (private.staff_session_ok() and private.has_role(array['owner','admin','editor','moderator','scanner','shift_lead']::public.staff_role[], id));
create policy "staff: read own assignments" on public.staff_assignments for select to authenticated
  using (user_id = auth.uid());
create policy "staff: admins read all" on public.staff_assignments for select to authenticated
  using (private.staff_session_ok() and private.has_role(array['owner','admin']::public.staff_role[]));
create policy "applications: guest read own" on public.applications for select to authenticated
  using (user_id = auth.uid());
create policy "applications: moderator reads assigned event" on public.applications for select to authenticated
  using (private.staff_session_ok() and private.has_role(array['owner','admin','moderator']::public.staff_role[], event_id));
create policy "applications: guest creates own submitted" on public.applications for insert to authenticated
  with check (
    user_id = auth.uid() and status = 'submitted' and reviewed_by is null
    and exists (select 1 from public.events e where e.id = event_id and e.status = 'published')
  );
create policy "applications: guest withdraws own" on public.applications for update to authenticated
  using (user_id = auth.uid() and status = 'submitted')
  with check (user_id = auth.uid() and status = 'withdrawn');

create function public.review_application(_application uuid, _decision public.application_status)
returns public.application_status language plpgsql security definer set search_path = ''
as $$
declare v_event uuid; v_status public.application_status; v_corr uuid := gen_random_uuid();
begin
  if _decision not in ('approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  if not private.staff_session_ok() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select event_id into v_event from public.applications where id = _application;
  if v_event is null
     or not private.has_role(array['owner','admin','moderator']::public.staff_role[], v_event) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select status into v_status from public.applications
    where id = _application and event_id = v_event for update;
  if v_status is null then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if v_status <> 'submitted' then
    raise exception 'invalid transition' using errcode = '22023';
  end if;
  update public.applications set status = _decision, reviewed_by = auth.uid(), updated_at = now() where id = _application;
  insert into private.audit_log (actor, action, object_type, object_id, result, correlation_id, details)
    values (auth.uid(), 'application.review', 'application', _application, 'ok', v_corr, jsonb_build_object('decision', _decision));
  insert into private.outbox (topic, payload)
    values ('application.reviewed', jsonb_build_object('application_id', _application, 'decision', _decision, 'correlation_id', v_corr));
  return _decision;
end $$;

create function public.revoke_staff_assignment(_assignment uuid)
returns text language plpgsql security definer set search_path = ''
as $$
declare v_corr uuid := gen_random_uuid(); v_role public.staff_role; v_revoked timestamptz; v_n int;
begin
  if not private.staff_session_ok() or not private.has_role(array['owner','admin']::public.staff_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select role, revoked_at into v_role, v_revoked from public.staff_assignments where id = _assignment for update;
  if not found then
    raise exception 'assignment not found' using errcode = 'P0002';
  end if;
  if v_role = 'owner' then
    raise exception 'owner cannot be revoked here' using errcode = '42501';
  end if;
  if v_revoked is not null then
    insert into private.audit_log (actor, action, object_type, object_id, result, correlation_id)
      values (auth.uid(), 'staff.revoke', 'staff_assignment', _assignment, 'noop', v_corr);
    return 'already_revoked';
  end if;
  update public.staff_assignments set revoked_at = now() where id = _assignment and revoked_at is null;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'revoke not applied' using errcode = '40001';
  end if;
  insert into private.audit_log (actor, action, object_type, object_id, result, correlation_id)
    values (auth.uid(), 'staff.revoke', 'staff_assignment', _assignment, 'ok', v_corr);
  return 'revoked';
end $$;

revoke execute on function public.review_application(uuid, public.application_status) from public, anon;
revoke execute on function public.revoke_staff_assignment(uuid) from public, anon;
grant execute on function public.review_application(uuid, public.application_status) to authenticated;
grant execute on function public.revoke_staff_assignment(uuid) to authenticated;

create function private.bootstrap_first_owner(_user uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtext('vne.bootstrap_first_owner'));
  if exists (select 1 from public.staff_assignments where role = 'owner' and revoked_at is null) then
    raise exception 'owner already exists' using errcode = '42501';
  end if;
  insert into public.staff_assignments (user_id, role) values (_user, 'owner');
  insert into private.audit_log (actor, action, object_type, object_id, result)
    values (null, 'staff.bootstrap_owner', 'user', _user, 'ok');
end $$;
revoke execute on function private.bootstrap_first_owner(uuid) from public, anon, authenticated, service_role;

create function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

create function public.my_staff_access(_area text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select case _area
    when 'admin' then private.staff_session_ok()
      and private.has_role(array['owner','admin','editor','moderator']::public.staff_role[])
    when 'scan' then private.staff_session_ok()
      and exists (
        select 1 from public.staff_assignments s
        where s.user_id = auth.uid()
          and s.role = any (array['owner','admin','scanner','shift_lead']::public.staff_role[])
          and s.revoked_at is null and s.valid_from <= now()
          and (s.valid_until is null or s.valid_until > now())
      )
    else false
  end
$$;
revoke execute on function public.my_staff_access(text) from public, anon;
grant execute on function public.my_staff_access(text) to authenticated;