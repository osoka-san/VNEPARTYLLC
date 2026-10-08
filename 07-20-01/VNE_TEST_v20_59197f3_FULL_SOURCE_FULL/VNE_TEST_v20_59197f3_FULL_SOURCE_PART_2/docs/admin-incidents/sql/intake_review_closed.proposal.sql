-- CLOSED TEST CANDIDATE ONLY. General owned R2 questionnaires, not event admission.
-- No invitations, emails, payments, tickets, CMS rights or admission mutation.
begin;
set local search_path='';
set local lock_timeout='3s';
do $$ begin
 if current_user<>'postgres' or to_regprocedure('private.vne_incident_reason(jsonb)') is null
   or to_regprocedure('private.membership_questionnaire_submit(jsonb)') is null then
   raise exception 'intake_review_prerequisites_missing';
 end if;
end $$;

create table private.vne_intake_reviews (
 id uuid primary key default gen_random_uuid(),
 request_id uuid not null references public.membership_requests(id) on delete restrict,
 actor_id uuid not null references auth.users(id) on delete restrict,
 from_status public.membership_request_status not null,
 decision public.membership_request_status not null check(decision in ('approved','rejected')),
 reason text not null check(char_length(reason) between 3 and 1000),
 operation_id uuid not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 correlation_id uuid not null default gen_random_uuid(),
 created_at timestamptz not null default clock_timestamp(),
 unique(actor_id,operation_id)
);
alter table private.vne_intake_reviews enable row level security;
revoke all on private.vne_intake_reviews from PUBLIC,anon,authenticated,service_role;
create trigger vne_intake_reviews_immutable before update or delete on private.vne_intake_reviews
 for each row execute function private.vne_incident_immutable();

create function private.vne_intake_can_review() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and auth.jwt()->>'role'='authenticated'
 and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false and private.vne_incident_session_ok()
 and exists(select 1 from public.staff_assignments s where s.user_id=auth.uid()
   and s.role::text='membership_reviewer' and s.event_id is null and s.revoked_at is null
   and s.valid_from<=now() and (s.valid_until is null or s.valid_until>now()));
$$;

create function private.vne_intake_list(_status text default null,_page integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.vne_intake_can_review() then raise exception 'forbidden' using errcode='42501'; end if;
 if _page is null or _page<0 or _page>10000 or (_status is not null and _status not in ('pending','approved','rejected')) then
   raise exception 'invalid_query' using errcode='22023';
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('requestId',r.id,'ownerUserId',r.owner_user_id,
   'status',r.status,'createdAt',r.created_at,'questionnaireVersion',r.questionnaire_snapshot->>'version')
   order by r.created_at desc,r.id desc),'[]'::jsonb) into result
 from (select id,owner_user_id,status,created_at,questionnaire_snapshot from public.membership_requests
   where owner_user_id is not null and (_status is null or status::text=_status)
   order by created_at desc,id desc limit 26 offset _page*25)r;
 return jsonb_build_object('items',result,'page',_page,'hasMore',jsonb_array_length(result)=26);
end $$;

create function private.vne_intake_read(_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.vne_intake_can_review() then raise exception 'forbidden' using errcode='42501'; end if;
 select jsonb_build_object('requestId',r.id,'ownerUserId',r.owner_user_id,'displayName',r.display_name,
   'contactEmail',r.email,'telegramUsername',r.telegram_username,'status',r.status,'createdAt',r.created_at,
   'questionnaire',r.questionnaire_snapshot,'consentVersion',r.consent_version)
 into result from public.membership_requests r where r.id=_request and r.owner_user_id is not null;
 if result is null then return jsonb_build_object('item',null); end if;
 insert into private.audit_log(actor,action,object_type,object_id,result,details)
   values(auth.uid(),'intake.detail_read','membership_request',_request,'ok','{}');
 return jsonb_build_object('item',result);
end $$;

create function private.vne_intake_review(_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); requestid uuid; opid uuid; decisiontext text; reasontext text;
 expected text; bodyhash text; old private.vne_intake_reviews; row public.membership_requests;
 reviewid uuid; corr uuid:=gen_random_uuid();
begin
 if not private.vne_intake_can_review() then raise exception 'forbidden' using errcode='42501'; end if;
 if not private.r2_exact_keys(_command,array['requestId','operationId','expectedStatus','decision','reason'])
   or octet_length(_command::text)>16384 then raise exception 'invalid_command' using errcode='22023'; end if;
 requestid:=(_command->>'requestId')::uuid; opid:=(_command->>'operationId')::uuid;
 decisiontext:=_command->>'decision'; expected:=_command->>'expectedStatus';
 reasontext:=private.vne_incident_reason(_command->'reason');
 if requestid is null or opid is null or expected is distinct from 'pending'
   or decisiontext is null or decisiontext not in ('approved','rejected') then
   raise exception 'invalid_command' using errcode='22023';
 end if;
 bodyhash:=encode(sha256(convert_to(_command::text,'UTF8')),'hex');
 perform pg_advisory_xact_lock(hashtextextended(actor::text||opid::text,0));
 select * into old from private.vne_intake_reviews where actor_id=actor and operation_id=opid;
 if found then
   if old.fingerprint<>bodyhash then raise exception 'idempotency_conflict' using errcode='22023'; end if;
   return jsonb_build_object('requestId',old.request_id,'reviewId',old.id,'decision',old.decision,'replayed',true);
 end if;
 select * into row from public.membership_requests where id=requestid and owner_user_id is not null for update;
 if not found then raise exception 'not_found' using errcode='P0002'; end if;
 if row.status::text<>expected then raise exception 'version_conflict' using errcode='40001'; end if;
 if not private.vne_intake_can_review() then raise exception 'forbidden' using errcode='42501'; end if;
 update public.membership_requests set status=decisiontext::public.membership_request_status,
   reviewed_by=actor,reviewed_at=clock_timestamp(),updated_at=clock_timestamp() where id=requestid;
 insert into private.vne_intake_reviews(request_id,actor_id,from_status,decision,reason,operation_id,fingerprint,correlation_id)
   values(requestid,actor,row.status,decisiontext::public.membership_request_status,reasontext,opid,bodyhash,corr) returning id into reviewid;
 insert into private.audit_log(actor,action,object_type,object_id,result,correlation_id,details)
   values(actor,'intake.review','membership_request',requestid,'ok',corr,jsonb_build_object('decision',decisiontext,'operation_id',opid));
 return jsonb_build_object('requestId',requestid,'reviewId',reviewid,'decision',decisiontext,'replayed',false);
end $$;

revoke all on function private.vne_intake_can_review() from PUBLIC,anon,authenticated,service_role;
revoke all on function private.vne_intake_list(text,integer) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.vne_intake_read(uuid) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.vne_intake_review(jsonb) from PUBLIC,anon,authenticated,service_role;
commit;
