drop function public.review_membership_request(uuid, public.membership_request_status);

create function private.review_membership_request(
  _request uuid,
  _decision public.membership_request_status,
  _actor uuid
) returns public.membership_request_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.membership_request_status;
  v_corr uuid := gen_random_uuid();
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if _decision not in ('approved', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.staff_assignments
    where user_id = _actor
      and role = any(array['owner','admin','moderator']::public.staff_role[])
      and revoked_at is null
      and valid_from <= now()
      and (valid_until is null or valid_until > now())
  ) then
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
      reviewed_by = _actor,
      reviewed_at = now(),
      updated_at = now()
  where id = _request and status = 'pending';

  insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
  values (_actor, 'membership_request.review', 'membership_request', _request, 'ok', v_corr,
    jsonb_build_object('decision', _decision));

  return _decision;
end
$$;
revoke execute on function private.review_membership_request(uuid, public.membership_request_status, uuid) from public, anon, authenticated;
grant execute on function private.review_membership_request(uuid, public.membership_request_status, uuid) to service_role;