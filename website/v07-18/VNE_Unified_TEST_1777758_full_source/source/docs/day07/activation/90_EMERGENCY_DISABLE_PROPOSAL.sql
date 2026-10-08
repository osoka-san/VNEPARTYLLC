-- Bundle exact close-down with enablement approval. No deletion or Auth changes.
begin;set local search_path='';set local lock_timeout='3s';set local statement_timeout='10s';
do $disable$ begin
 if not exists(select 1 from private.qr_admission_config where singleton and project_ref='xrocuwlofxhxoxajukne') then raise exception 'exact_TEST_required';end if;
 update private.qr_admission_config set enabled=false,synthetic_admission=false where singleton;
 if to_regprocedure('public.vne_qr_command(jsonb)') is not null then execute 'revoke all on function public.vne_qr_command(jsonb) from PUBLIC,anon,authenticated,service_role';end if;
 insert into private.audit_log(action,object_type,object_id,result,details) values('day07.synthetic_disable','event','d0700000-0000-4000-8000-000000000001','ok','{"synthetic":true,"preserveEvidence":true,"externalDelivery":false}');
end $disable$;commit;
-- Keep full-QR runtime flags while this build is live, so forms/previews remain accessible.
-- A questionnaire-only rollback requires a paired compatible reviewed source publication.
