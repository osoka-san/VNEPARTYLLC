-- FINAL CUTOVER, only after the exact flag-enabled TEST version is successfully deployed.
begin;
set local search_path='';
set local lock_timeout='3s';
do $$
begin
 if current_user in ('anon','authenticated','service_role','authenticator')
 or not has_function_privilege('authenticated','public.vne_read_my_questionnaire_draft()','EXECUTE')
 or not has_function_privilege('authenticated','public.vne_save_my_questionnaire_draft(jsonb)','EXECUTE')
 or not has_function_privilege('authenticated','public.vne_submit_membership_questionnaire_with_draft(jsonb,jsonb)','EXECUTE') then
  raise exception 'questionnaire_draft_cutover_precondition';
 end if;
end $$;
revoke execute on function public.vne_submit_membership_questionnaire(jsonb) from PUBLIC,anon,authenticated,service_role;
commit;
