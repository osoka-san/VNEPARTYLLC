-- 1) move definer bodies into private; public wrappers become SECURITY INVOKER
alter function public.my_staff_access(text) set schema private;
alter function public.review_application(uuid, public.application_status) set schema private;
alter function public.revoke_staff_assignment(uuid) set schema private;
revoke all on function private.my_staff_access(text) from public, anon;
revoke all on function private.review_application(uuid, public.application_status) from public, anon;
revoke all on function private.revoke_staff_assignment(uuid) from public, anon;
grant execute on function private.my_staff_access(text) to authenticated, service_role;
grant execute on function private.review_application(uuid, public.application_status) to authenticated;
grant execute on function private.revoke_staff_assignment(uuid) to authenticated;

create function public.my_staff_access(_area text) returns boolean
language sql stable security invoker set search_path = ''
as $$ select private.my_staff_access(_area) $$;
create function public.review_application(_application uuid, _decision public.application_status)
returns public.application_status language sql security invoker set search_path = ''
as $$ select private.review_application(_application, _decision) $$;
create function public.revoke_staff_assignment(_assignment uuid) returns text
language sql security invoker set search_path = ''
as $$ select private.revoke_staff_assignment(_assignment) $$;
revoke all on function public.my_staff_access(text) from public, anon;
revoke all on function public.review_application(uuid, public.application_status) from public, anon;
revoke all on function public.revoke_staff_assignment(uuid) from public, anon;
grant execute on function public.my_staff_access(text) to authenticated, service_role;
grant execute on function public.review_application(uuid, public.application_status) to authenticated;
grant execute on function public.revoke_staff_assignment(uuid) to authenticated;

-- 2) grant staff role (owner/admin with MFA session)
create function private.grant_staff_assignment(_email text, _role public.staff_role)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare v_user uuid; v_id uuid; v_corr uuid := gen_random_uuid();
begin
  if not private.staff_session_ok() or not private.has_role(array['owner','admin']::public.staff_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _role = 'owner' then
    raise exception 'owner cannot be granted here' using errcode = '42501';
  end if;
  if _role = 'admin' and not private.has_role(array['owner']::public.staff_role[]) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(trim(_email));
  if v_user is null then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  select id into v_id from public.staff_assignments
   where user_id = v_user and role = _role and event_id is null and revoked_at is null
     and (valid_until is null or valid_until > now());
  if v_id is not null then return v_id; end if;
  insert into public.staff_assignments(user_id, role, granted_by) values (v_user, _role, auth.uid())
  returning id into v_id;
  insert into private.audit_log (actor, action, object_type, object_id, result, correlation_id, details)
    values (auth.uid(), 'staff.grant', 'staff_assignment', v_id, 'ok', v_corr, jsonb_build_object('role', _role));
  return v_id;
end $$;
revoke all on function private.grant_staff_assignment(text, public.staff_role) from public, anon;
grant execute on function private.grant_staff_assignment(text, public.staff_role) to authenticated;
create function public.grant_staff_assignment(_email text, _role public.staff_role) returns uuid
language sql security invoker set search_path = ''
as $$ select private.grant_staff_assignment(_email, _role) $$;
revoke all on function public.grant_staff_assignment(text, public.staff_role) from public, anon;
grant execute on function public.grant_staff_assignment(text, public.staff_role) to authenticated;

-- 3) copy request name/telegram to profile on successful invite
create or replace function public.record_membership_invite(_request uuid, _invited_user uuid, _invite_error text default null)
returns void language plpgsql security definer set search_path = ''
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
  if _invite_error is null and _invited_user is not null then
    insert into public.profiles(id) values (_invited_user) on conflict do nothing;
    update public.profiles p
       set display_name = coalesce(p.display_name, r.display_name),
           telegram_username = coalesce(p.telegram_username, r.telegram_username)
      from public.membership_requests r
     where r.id = _request and p.id = _invited_user
       and not exists (select 1 from public.profiles o where o.telegram_username = r.telegram_username and o.id <> _invited_user);
  end if;
end $$;