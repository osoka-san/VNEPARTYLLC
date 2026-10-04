create or replace function private.staff_can(_cap text, _event uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.staff_session_ok() and case _cap
    when 'shell' then exists (select 1 from public.staff_assignments s where s.user_id = auth.uid()
      and s.role = any (array['owner','admin','editor','moderator']::public.staff_role[])
      and s.revoked_at is null and s.valid_from <= now() and (s.valid_until is null or s.valid_until > now()))
    when 'membership' then private.has_role(array['owner','admin']::public.staff_role[], null)
    when 'team' then private.has_role(array['owner','admin']::public.staff_role[], null)
    when 'content' then private.has_role(array['owner','admin','editor']::public.staff_role[], null)
    when 'event_moderate' then _event is not null and private.has_role(array['owner','admin','moderator']::public.staff_role[], _event)
    else false end
$$;
revoke execute on function private.staff_can(text, uuid) from public, anon;
grant execute on function private.staff_can(text, uuid) to authenticated;
create function public.staff_can(_cap text, _event uuid default null) returns boolean
language sql stable security invoker set search_path = '' as $$ select private.staff_can(_cap, _event) $$;
revoke execute on function public.staff_can(text, uuid) from public, anon;
grant execute on function public.staff_can(text, uuid) to authenticated;

create or replace function private.my_staff_access(_area text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case _area
    when 'admin' then private.staff_can('shell')
    when 'scan' then private.staff_session_ok() and exists (
        select 1 from public.staff_assignments s where s.user_id = auth.uid()
          and s.role = any (array['owner','admin','scanner','shift_lead']::public.staff_role[])
          and s.revoked_at is null and s.valid_from <= now() and (s.valid_until is null or s.valid_until > now()))
    else false end
$$;

drop function public.grant_staff_assignment(text, public.staff_role);
drop function private.grant_staff_assignment(text, public.staff_role);
create function private.grant_staff_assignment(_email text, _role public.staff_role, _event uuid default null, _valid_until timestamptz default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_id uuid; v_corr uuid := gen_random_uuid();
begin
  if not private.staff_can('team') then raise exception 'forbidden' using errcode = '42501'; end if;
  if _role = 'owner' then raise exception 'owner cannot be granted here' using errcode = '42501'; end if;
  if _role = 'admin' and not private.has_role(array['owner']::public.staff_role[], null) then
    raise exception 'forbidden' using errcode = '42501'; end if;
  if _role in ('moderator','scanner','shift_lead') and _event is null then
    raise exception 'event required' using errcode = '22023'; end if;
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
revoke execute on function private.grant_staff_assignment(text, public.staff_role, uuid, timestamptz) from public, anon;
grant execute on function private.grant_staff_assignment(text, public.staff_role, uuid, timestamptz) to authenticated;
create function public.grant_staff_assignment(_email text, _role public.staff_role, _event uuid default null, _valid_until timestamptz default null)
returns uuid language sql security invoker set search_path = '' as $$ select private.grant_staff_assignment(_email, _role, _event, _valid_until) $$;
revoke execute on function public.grant_staff_assignment(text, public.staff_role, uuid, timestamptz) from public, anon;
grant execute on function public.grant_staff_assignment(text, public.staff_role, uuid, timestamptz) to authenticated;

-- Не больше одного действующего приглашения на заявку.
create unique index if not exists invites_one_active on public.invites(request_id) where status in ('created','sent');

-- Решение по членству: пользовательский контекст, capability membership, атомарно с приглашением.
create or replace function private.membership_decide(_request uuid, _decision public.membership_request_status)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_status public.membership_request_status; v_email text; v_corr uuid := gen_random_uuid(); v_inv uuid; v_code text; n int := 0;
begin
  if not private.staff_can('membership') then raise exception 'forbidden' using errcode = '42501'; end if;
  if _decision not in ('approved','rejected') then raise exception 'invalid decision' using errcode = '22023'; end if;
  select status, email into v_status, v_email from public.membership_requests where id = _request for update;
  if v_status is null then raise exception 'not found' using errcode = 'P0002'; end if;
  if v_status <> 'pending' then
    insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
      values (auth.uid(), 'membership_request.review', 'membership_request', _request, 'noop', v_corr, jsonb_build_object('current', v_status, 'requested', _decision));
    return jsonb_build_object('result', 'noop', 'status', v_status);
  end if;
  update public.membership_requests set status = _decision, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() where id = _request;
  if _decision = 'approved' then
    loop
      n := n + 1;
      begin
        insert into public.invites(code, request_id, email, issued_by) values (private.invite_code(), _request, v_email, auth.uid())
          returning id, code into v_inv, v_code;
        exit;
      exception when unique_violation then if n > 5 then raise; end if; end;
    end loop;
    update public.membership_requests set current_invite_id = v_inv where id = _request;
  end if;
  insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
    values (auth.uid(), 'membership_request.review', 'membership_request', _request, 'ok', v_corr, jsonb_build_object('decision', _decision, 'invite', v_inv));
  insert into private.outbox(topic, payload, status)
    values ('membership.decided', jsonb_build_object('request_id', _request, 'decision', _decision, 'invite_id', v_inv, 'correlation_id', v_corr), 'held');
  return jsonb_build_object('result', 'changed', 'status', _decision, 'invite_id', v_inv, 'code', v_code);
end $$;
revoke execute on function private.membership_decide(uuid, public.membership_request_status) from public, anon;
grant execute on function private.membership_decide(uuid, public.membership_request_status) to authenticated;
create function public.membership_decide(_request uuid, _decision public.membership_request_status) returns jsonb
language sql security invoker set search_path = '' as $$ select private.membership_decide(_request, _decision) $$;
revoke execute on function public.membership_decide(uuid, public.membership_request_status) from public, anon;
grant execute on function public.membership_decide(uuid, public.membership_request_status) to authenticated;

-- issue_invite: блокировка заявки перед заменой.
create or replace function public.issue_invite(_request uuid, _actor uuid)
returns table(id uuid, code text) language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_code text; v_email text; n int := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  select r.email into v_email from public.membership_requests r where r.id = _request and r.status = 'approved' for update;
  if v_email is null then raise exception 'not approved' using errcode = '22023'; end if;
  update public.invites i set status = 'replaced', updated_at = now() where i.request_id = _request and i.status in ('created','sent','failed');
  loop
    n := n + 1;
    begin
      insert into public.invites(code, request_id, email, issued_by) values (private.invite_code(), _request, v_email, _actor)
        returning invites.id, invites.code into v_id, v_code;
      exit;
    exception when unique_violation then if n > 5 then raise; end if; end;
  end loop;
  update public.membership_requests set current_invite_id = v_id, updated_at = now() where membership_requests.id = _request;
  insert into private.audit_log(actor, action, object_type, object_id, result, details)
    values (_actor, 'invite.issue', 'invite', v_id, 'ok', jsonb_build_object('code', v_code, 'request', _request));
  return query select v_id, v_code;
end $$;

-- Принятие приглашения: только текущее, отправленное, неистёкшее. Пользователи без приглашений не затрагиваются.
drop function public.accept_invite(uuid);
create function public.accept_invite(_user uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists (select 1 from public.invites where invited_user_id = _user)
     or exists (select 1 from public.invites where invited_user_id = _user and status = 'accepted') then
    return 'not_required';
  end if;
  update public.invites i set status = 'accepted', accepted_at = now(), updated_at = now()
   where i.invited_user_id = _user and i.status = 'sent' and i.expires_at > now()
     and i.id = (select r.current_invite_id from public.membership_requests r where r.id = i.request_id)
   returning i.id into v;
  insert into private.audit_log(actor, action, object_type, object_id, result)
    values (_user, 'invite.accept', 'invite', v, case when v is null then 'denied' else 'ok' end);
  return case when v is null then 'denied' else 'accepted' end;
end $$;
revoke execute on function public.accept_invite(uuid) from public, anon, authenticated;
grant execute on function public.accept_invite(uuid) to service_role;