-- Событийные роли требуют и событие, и срок. Проверка перед миграцией: 0 таких назначений без срока (только owner, бессрочно — не затрагивается).
alter table public.staff_assignments
  add constraint event_role_scope_and_expiry check (
    role not in ('moderator','scanner','shift_lead') or (event_id is not null and valid_until is not null)
  );

create or replace function private.grant_staff_assignment(_email text, _role public.staff_role, _event uuid default null, _valid_until timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_id uuid; v_corr uuid := gen_random_uuid();
begin
  if not private.staff_can('team') then raise exception 'forbidden' using errcode = '42501'; end if;
  if _role = 'owner' then raise exception 'owner cannot be granted here' using errcode = '42501'; end if;
  if _role = 'admin' and not private.has_role(array['owner']::public.staff_role[], null) then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if _role in ('moderator','scanner','shift_lead') and _event is null then
    raise exception 'event required' using errcode = '22023'; end if;
  if _role in ('moderator','scanner','shift_lead') and _valid_until is null then
    raise exception 'expiry required' using errcode = '22023'; end if;
  if _role in ('admin','editor') and _event is not null then
    raise exception 'global role' using errcode = '22023'; end if;
  if _valid_until is not null and _valid_until <= now() then
    raise exception 'expiry in past' using errcode = '22023'; end if;
  if _event is not null and not exists (select 1 from public.events where id = _event) then
    raise exception 'event not found' using errcode = 'P0002'; end if;
  select id into v_user from auth.users where lower(email) = lower(trim(_email));
  if v_user is null then raise exception 'user not found' using errcode = 'P0002'; end if;
  select id into v_id from public.staff_assignments
   where user_id = v_user and role = _role and event_id is not distinct from _event and revoked_at is null
     and (valid_until is null or valid_until > now());
  if v_id is not null then return v_id; end if;
  insert into public.staff_assignments(user_id, role, event_id, valid_until, granted_by)
    values (v_user, _role, _event, _valid_until, auth.uid()) returning id into v_id;
  insert into private.audit_log (actor, action, object_type, object_id, result, correlation_id, details)
    values (auth.uid(), 'staff.grant', 'staff_assignment', v_id, 'ok', v_corr,
      jsonb_build_object('role', _role, 'event', _event, 'valid_until', _valid_until));
  return v_id;
end $$;