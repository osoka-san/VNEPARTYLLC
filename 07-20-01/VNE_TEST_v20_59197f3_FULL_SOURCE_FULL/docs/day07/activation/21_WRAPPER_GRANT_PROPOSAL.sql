-- LOCAL PROPOSAL: separate exact authenticated EXECUTE approval required.
begin;set local search_path='';
do $grant$ begin
 if nullif(current_setting('vne.day07.approval_ref',true),'') is null then raise exception 'explicit_grant_approval_required';end if;
 if not exists(select 1 from private.qr_admission_config where singleton and project_ref='xrocuwlofxhxoxajukne' and not enabled and not synthetic_admission) then raise exception 'closed_TEST_required';end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure('public.vne_qr_command(jsonb)') and prosecdef and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='d8944aa95bd076f9b6180f9e26cec569c2e0fbce7f54df7c7822d6c69a13ee88') then raise exception 'exact_scoped_wrapper_required';end if;
 if exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated','service_role') and has_function_privilege(r.oid,'private.qr_command(jsonb)'::regprocedure,'execute')) then raise exception 'private_ACL_drift';end if;
end $grant$;
revoke all on function public.vne_qr_command(jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function public.vne_qr_command(jsonb) to authenticated;
commit;
