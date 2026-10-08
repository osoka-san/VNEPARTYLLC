-- NEW CLOSED ACTIVATION PROPOSAL, 2026-10-08. Not the lost Oct7 three-file freeze.
-- Exact target: Supabase TEST xrocuwlofxhxoxajukne, no other project.
-- Apply only after a fresh exact action-time approval and live prerequisite recheck.
begin;
set local search_path='';
set local lock_timeout='3s';
select pg_catalog.set_config('vne.activation_approval','PENDING_OWNER_ACTION_TIME_APPROVAL',true);
do $activate$
declare
 target constant uuid := '02e03845-bc0d-4a9b-8500-87bb1f11ccf6';
 expected_marker constant text := 'TEST_ADMIN_INCIDENT_MANAGER_R2_REVIEW_STAFF_EXEMPT_EXPLICITLY_APPROVED';
 request_ref text := pg_catalog.current_setting('vne.activation_approval_reference',true);
 person record;
 row_id uuid;
 role_name text;
 correlation uuid := pg_catalog.gen_random_uuid();
 signature text;
begin
 if current_user<>'postgres' then raise exception 'activation_owner_mismatch'; end if;
 if pg_catalog.current_setting('vne.activation_approval',true) is distinct from expected_marker
    or request_ref is null or pg_catalog.length(request_ref)<8 then
   raise exception 'activation_action_time_approval_missing';
 end if;
 select u.id,u.email,u.email_confirmed_at,u.is_anonymous,u.banned_until into person
 from auth.users u where u.id=target for update;
 if not found or pg_catalog.lower(person.email) is distinct from 'savik3003@gmail.com'
    or person.email_confirmed_at is null or person.is_anonymous is distinct from false
    or coalesce(person.banned_until>pg_catalog.now(),false) then
   raise exception 'activation_identity_prerequisite_failed';
 end if;
 if not exists(select 1 from auth.mfa_factors f where f.user_id=target
    and f.status::text='verified' and f.factor_type::text='totp') then
   raise exception 'activation_self_enrolled_totp_required';
 end if;
 if not exists(select 1 from auth.sessions s join auth.mfa_factors f
    on f.id=s.factor_id and f.user_id=s.user_id and f.status::text='verified'
    where s.user_id=target and s.aal::text='aal2'
    and (s.not_after is null or s.not_after>now())) then
   raise exception 'activation_current_linked_aal2_required';
 end if;
 if to_regprocedure('private.vne_incident_session_ok()') is null
    or (select (p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
            and p.proconfig=array['search_path=""']::text[]
            and md5(p.prosrc)='79575344943435790f67016b82741ea8') is not true from pg_proc p
            where p.oid=to_regprocedure('private.vne_incident_session_ok()')) then
   raise exception 'activation_hardened_guard_missing';
 end if;
 foreach signature in array array[
   'public.vne_incident_context()', 'public.vne_incident_lookup(uuid,text,text)',
   'public.vne_incident_read(uuid,uuid,uuid)', 'public.vne_incident_record(jsonb)',
   'public.vne_incident_append(jsonb)', 'public.vne_intake_list(text,integer)',
   'public.vne_intake_read(uuid)', 'public.vne_intake_review(jsonb)'] loop
   if pg_catalog.to_regprocedure(signature) is null then raise exception 'activation_rpc_missing'; end if;
   if not pg_catalog.has_function_privilege('authenticated',signature,'EXECUTE')
      or pg_catalog.has_function_privilege('anon',signature,'EXECUTE')
      or pg_catalog.has_function_privilege('service_role',signature,'EXECUTE') then
     raise exception 'activation_rpc_access_drift';
   end if;
 end loop;
 lock table public.staff_assignments in share row exclusive mode;
 if exists(select 1 from public.staff_assignments where user_id=target) then
   raise exception 'activation_existing_staff_assignment_requires_reconciliation';
 end if;
 if exists(select 1 from private.member_admission where user_id=target) then
   raise exception 'activation_existing_admission_requires_reconciliation';
 end if;
 insert into private.member_admission(user_id,state,source,invite_id)
 values(target,'exempt','explicit_test_staff_bootstrap_20261008',null);
 insert into private.audit_log(actor,action,object_type,object_id,result,correlation_id,details)
 values(null,'staff.bootstrap_admission','member_admission',target,'ok',correlation,
   jsonb_build_object('state','exempt','scope','TEST_STAFF_PREREQUISITE',
     'operator',current_user,'approval_reference',request_ref));
 foreach role_name in array array['incident_manager','membership_reviewer'] loop
   insert into public.staff_assignments(user_id,role,event_id,valid_until,granted_by)
   values(target,role_name::public.staff_role,null,null,null) returning id into row_id;
   insert into private.audit_log(actor,action,object_type,object_id,result,correlation_id,details)
   values(null,'staff.bootstrap_grant','staff_assignment',row_id,'ok',correlation,
     jsonb_build_object('role',role_name,'scope',case when role_name='incident_manager'
       then 'ALL_CURRENT_AND_FUTURE_TEST_EVENTS' else 'GENERAL_R2_QUESTIONNAIRE_REVIEW' end,
       'until','revoked','operator',current_user,'approval_reference',request_ref));
 end loop;
end $activate$;
commit;
