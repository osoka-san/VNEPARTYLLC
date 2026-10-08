-- Approved final ACL reference. Operational rollout uses reviewed stage and cutover files.
-- Exact TEST target, trusted definitions/owners/ACLs must be rechecked before approval.
-- Replaces authenticated EXECUTE on the old finalizer with three scoped wrappers.
-- It gives no staff rights, direct table access, schema access, Auth grants or credentials.
begin;
set local search_path='';
set local lock_timeout='3s';
do $$
declare owner_id oid;
begin
 select oid into owner_id from pg_catalog.pg_roles where rolname=current_user;
 if current_user in ('anon','authenticated','service_role','authenticator')
 or owner_id is distinct from (select relowner from pg_catalog.pg_class where oid='private.questionnaire_drafts'::regclass)
 or owner_id is distinct from (select proowner from pg_catalog.pg_proc where oid='private.questionnaire_draft_read()'::regprocedure)
 or owner_id is distinct from (select proowner from pg_catalog.pg_proc where oid='private.questionnaire_draft_save(jsonb)'::regprocedure)
 or owner_id is distinct from (select proowner from pg_catalog.pg_proc where oid='private.questionnaire_draft_submit(jsonb,jsonb)'::regprocedure) then
  raise exception 'questionnaire_draft_activation_owner_mismatch';
 end if;
end $$;
create function public.vne_read_my_questionnaire_draft() returns jsonb
language plpgsql security definer set search_path='' as $$
begin return private.questionnaire_draft_read(); end $$;
create function public.vne_save_my_questionnaire_draft(_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin return private.questionnaire_draft_save(_command); end $$;
create function public.vne_submit_membership_questionnaire_with_draft(_command jsonb,_draft jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
begin return private.questionnaire_draft_submit(_command,_draft); end $$;
revoke all on function public.vne_read_my_questionnaire_draft() from PUBLIC,anon,authenticated,service_role;
revoke all on function public.vne_save_my_questionnaire_draft(jsonb) from PUBLIC,anon,authenticated,service_role;
revoke all on function public.vne_submit_membership_questionnaire_with_draft(jsonb,jsonb) from PUBLIC,anon,authenticated,service_role;
-- Retire the old bypass: direct RPC submission must not evade draft version checking/atomic clearing.
revoke execute on function public.vne_submit_membership_questionnaire(jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function public.vne_read_my_questionnaire_draft() to authenticated;
grant execute on function public.vne_save_my_questionnaire_draft(jsonb) to authenticated;
grant execute on function public.vne_submit_membership_questionnaire_with_draft(jsonb,jsonb) to authenticated;
commit;
