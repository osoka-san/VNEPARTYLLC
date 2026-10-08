create function public.review_membership_request_service(
  _request uuid,
  _decision public.membership_request_status,
  _actor uuid
) returns public.membership_request_status
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return private.review_membership_request(_request, _decision, _actor);
end
$$;
revoke execute on function public.review_membership_request_service(uuid, public.membership_request_status, uuid) from public, anon, authenticated;
grant execute on function public.review_membership_request_service(uuid, public.membership_request_status, uuid) to service_role;