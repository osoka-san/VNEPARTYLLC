-- LOCAL ACCESS-EXPANSION PROPOSAL ONLY. DO NOT APPLY WITHOUT SEPARATE EXPLICIT APPROVAL.
-- This is intentionally separate from the closed persistence proposal.
-- Preconditions: reviewed persistence proposal applied, real Auth/transport/age/consent gates resolved,
-- exact target, owners, definitions and effective ACLs re-verified. No approval is conferred by this file.
-- Expands only EXECUTE on these two public wrapper signatures to authenticated.
-- No table privileges, private-schema usage, API credentials, Auth settings or new RLS policies.
begin;
set local search_path = '';
set local lock_timeout = '3s';

-- The execution owner must be the trusted owner already used by the reviewed private boundary.
-- Do not silently switch roles, transfer ownership, or let an API role create a definer wrapper.
do $$
declare owner_id oid;
begin
 select oid into owner_id from pg_catalog.pg_roles where rolname=current_user;
 if current_user in ('anon','authenticated','service_role','authenticator')
 or owner_id is distinct from (select relowner from pg_catalog.pg_class where oid='public.membership_requests'::regclass)
 or owner_id is distinct from (select proowner from pg_catalog.pg_proc where oid='private.membership_questionnaire_submit(jsonb)'::regprocedure)
 or owner_id is distinct from (select proowner from pg_catalog.pg_proc where oid='private.membership_questionnaire_read_own(uuid)'::regprocedure)
 or owner_id is distinct from (select proowner from pg_catalog.pg_proc where oid='private.membership_questionnaire_list_own()'::regprocedure) then
  raise exception 'membership_questionnaire_activation_owner_mismatch';
 end if;
end $$;

-- SECURITY DEFINER is required only because authenticated has no private-schema or table access.
-- Ownership and current-session validation remain in the reviewed private functions.
create function public.vne_submit_membership_questionnaire(_command jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' then
  raise exception 'forbidden' using errcode='42501';
 end if;
 return private.membership_questionnaire_submit(_command);
end $$;

create function public.vne_read_my_membership_questionnaires(_request uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare receipt jsonb;
begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' then
  raise exception 'forbidden' using errcode='42501';
 end if;
 if _request is null then return private.membership_questionnaire_list_own(); end if;
 receipt:=private.membership_questionnaire_read_own(_request);
 return case when receipt is null then '[]'::jsonb else pg_catalog.jsonb_build_array(receipt) end;
end $$;

-- Revoke inherited/default creation grants before either wrapper is committed.
revoke all on function public.vne_submit_membership_questionnaire(jsonb) from PUBLIC,anon,authenticated,service_role;
revoke all on function public.vne_read_my_membership_questionnaires(uuid) from PUBLIC,anon,authenticated,service_role;
grant execute on function public.vne_submit_membership_questionnaire(jsonb) to authenticated;
grant execute on function public.vne_read_my_membership_questionnaires(uuid) to authenticated;
commit;
