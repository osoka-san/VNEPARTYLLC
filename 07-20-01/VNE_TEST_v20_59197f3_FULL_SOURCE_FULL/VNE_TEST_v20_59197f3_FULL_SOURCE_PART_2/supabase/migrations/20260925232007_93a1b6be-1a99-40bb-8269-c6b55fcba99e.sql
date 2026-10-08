do $$ begin
  create type private.admission_state as enum ('pending','admitted','exempt','revoked');
exception when duplicate_object then null; end $$;

create table if not exists private.member_admission (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state private.admission_state not null default 'pending',
  source text not null,
  invite_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
revoke all on private.member_admission from public, anon, authenticated;

create or replace function private.is_admitted(_uid uuid)
returns boolean language sql stable security definer set search_path to '' as $$
  select _uid is not null and exists (select 1 from private.member_admission a
    where a.user_id = _uid and a.state in ('admitted','exempt'))
$$;
revoke all on function private.is_admitted(uuid) from public, anon;
grant execute on function private.is_admitted(uuid) to authenticated;

create or replace function private.require_admitted()
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if not private.is_admitted(auth.uid()) then raise exception 'not admitted' using errcode = '42501'; end if;
end $$;
revoke all on function private.require_admitted() from public, anon;
grant execute on function private.require_admitted() to authenticated;

-- новые аккаунты: по умолчанию pending
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into private.member_admission(user_id, state, source) values (new.id, 'pending', 'signup') on conflict do nothing;
  return new;
end $$;

-- backfill: только проверенный существующий владелец (единственный аккаунт на 25.09.2026 23:20 UTC)
insert into private.member_admission(user_id, state, source)
select s.user_id, 'exempt', 'legacy_owner'
from public.staff_assignments s
where s.user_id = 'bff82500-c992-411c-b182-167a67fb951b' and s.role = 'owner' and s.revoked_at is null
on conflict (user_id) do nothing;

-- свой статус (только чтение)
create or replace function public.my_admission()
returns text language sql stable security definer set search_path to '' as $$
  select coalesce((select a.state::text from private.member_admission a where a.user_id = auth.uid()), 'pending')
$$;
revoke all on function public.my_admission() from public, anon;
grant execute on function public.my_admission() to authenticated;

-- доверенная серверная установка (тестовая подготовка по точным id); authenticated/anon → forbidden
create or replace function public.set_admission_service(_user uuid, _state text, _source text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  insert into private.member_admission(user_id, state, source) values (_user, _state::private.admission_state, left(_source, 80))
  on conflict (user_id) do update set state = excluded.state, source = excluded.source, updated_at = now();
  insert into private.audit_log(action, object_type, object_id, result, details)
  values ('admission.set', 'user', _user, 'ok', jsonb_build_object('state', _state, 'source', left(_source, 80)));
end $$;
revoke all on function public.set_admission_service(uuid, text, text) from public, anon, authenticated;
grant execute on function public.set_admission_service(uuid, text, text) to service_role;

-- принятие конкретного привязанного приглашения атомарно даёт допуск
create or replace function public.accept_invite(_user uuid, _token_hash text DEFAULT NULL::text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
declare v uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.invites where invited_user_id = _user)
     or exists (select 1 from public.invites where invited_user_id = _user and status = 'accepted') then
    return 'not_required';
  end if;
  if _token_hash is not null and _token_hash ~ '^[0-9a-f]{64}$' then
    update public.invites i set status = 'accepted', accepted_at = now(), updated_at = now()
     where i.invited_user_id = _user and i.token_hash = _token_hash
       and i.status = 'sent' and i.expires_at > now() and i.revoked_at is null
       and i.id = (select r.current_invite_id from public.membership_requests r where r.id = i.request_id)
     returning i.id into v;
  end if;
  if v is not null then
    insert into private.member_admission(user_id, state, source, invite_id) values (_user, 'admitted', 'invite', v)
    on conflict (user_id) do update set state = 'admitted', source = 'invite', invite_id = v, updated_at = now()
      where private.member_admission.state <> 'exempt';
  end if;
  insert into private.audit_log(actor, action, object_type, object_id, result)
    values (_user, 'invite.accept', 'invite', v, case when v is null then 'denied' else 'ok' end);
  return case when v is null then 'denied' else 'accepted' end;
end $function$;

-- staff: сессия aal2 + допуск
create or replace function private.staff_session_ok() returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and private.is_admitted(auth.uid())
     and exists (select 1 from auth.sessions s
       where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid and s.user_id = auth.uid()
         and (s.not_after is null or s.not_after > now()))
$$;

-- личные RLS
drop policy if exists "profiles: read own" on public.profiles;
drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: read own" on public.profiles for select to authenticated
  using (id = auth.uid() and private.is_admitted(auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = auth.uid() and private.is_admitted(auth.uid())) with check (id = auth.uid());
drop policy if exists "applications: guest read own" on public.applications;
create policy "applications: guest read own" on public.applications for select to authenticated
  using (user_id = auth.uid() and private.is_admitted(auth.uid()));
drop policy if exists "app events: guest reads own" on public.application_events;
create policy "app events: guest reads own" on public.application_events for select to authenticated
  using (private.is_admitted(auth.uid()) and exists (select 1 from public.applications a
    where a.id = application_events.application_id and a.user_id = auth.uid()));

-- гостевые RPC (единственные точки входа через API)
create or replace function public.submit_application_v2(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid)
returns jsonb language plpgsql security invoker set search_path to '' as $$
begin
  perform private.require_admitted();
  return private.submit_application_v2(_event, _display_name, _age_confirmed, _consent_version, _idempotency);
end $$;
create or replace function public.submit_application(_event uuid, _display_name text, _age_confirmed boolean, _consent_version text, _idempotency uuid)
returns uuid language plpgsql security invoker set search_path to '' as $$
begin
  perform private.require_admitted();
  return private.submit_application(_event, _display_name, _age_confirmed, _consent_version, _idempotency);
end $$;
create or replace function public.guest_application_action(_app uuid, _action text, _expected_version integer, _reply text default null)
returns public.application_status language plpgsql security invoker set search_path to '' as $$
begin
  perform private.require_admitted();
  return private.guest_application_action(_app, _action, _expected_version, _reply);
end $$;
create or replace function public.guest_update_display_name(_app uuid, _name text, _expected_version integer)
returns integer language plpgsql security invoker set search_path to '' as $$
begin
  perform private.require_admitted();
  return private.guest_update_display_name(_app, _name, _expected_version);
end $$;

-- Storage private-docs
drop policy if exists "private-docs: owner read" on storage.objects;
drop policy if exists "private-docs: owner upload" on storage.objects;
drop policy if exists "private-docs: owner update" on storage.objects;
drop policy if exists "private-docs: owner delete" on storage.objects;
create policy "private-docs: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'private-docs' and (storage.foldername(name))[1] = auth.uid()::text and private.is_admitted(auth.uid()));
create policy "private-docs: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'private-docs' and (storage.foldername(name))[1] = auth.uid()::text and private.is_admitted(auth.uid()));
create policy "private-docs: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'private-docs' and (storage.foldername(name))[1] = auth.uid()::text and private.is_admitted(auth.uid()))
  with check (bucket_id = 'private-docs' and (storage.foldername(name))[1] = auth.uid()::text and private.is_admitted(auth.uid()));
create policy "private-docs: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'private-docs' and (storage.foldername(name))[1] = auth.uid()::text and private.is_admitted(auth.uid()));