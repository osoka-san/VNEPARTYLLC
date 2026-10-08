-- NEW SEPARATE CORRECTION PROPOSAL. No remote execution authorized.
-- Exact original applied storage hash remains 298b3d437b15b66b04771e7a894ef59ed59c119dd48b44830317c58e45aae0a0.
-- Rename ONLY SQL aliases that collide with PL/pgSQL row variables a/e in list/catalog.
-- No schema, Auth, grant opening, config enablement, fixture, QR or payment change.
begin;
set local vne.day07.approval_ref='Sentinel_1ecfe280757081918b3059c8ac58b122:closed-correctness-repair';
set local search_path='';
set local lock_timeout='3s';
do $correction_guard$
begin
 if nullif(current_setting('vne.day07.approval_ref',true),'') is null then raise exception 'private_alias_fix_approval_required'; end if;
 if not exists(select 1 from private.qr_admission_config where singleton and project_ref='xrocuwlofxhxoxajukne' and not enabled and not synthetic_admission)
 then raise exception 'closed_TEST_candidate_required'; end if;
 if to_regprocedure('public.vne_qr_command(jsonb)') is not null then raise exception 'public_wrapper_must_still_be_absent'; end if;
 if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.qr_command(jsonb)')
 and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='3ecee343dd363abb3a9fed23fe4744d8de5db611bd496050c30cc5e0b99f742c')
 then raise exception 'exact_applied_private_command_body_required'; end if;
 if exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated','service_role')
 and has_function_privilege(r.rolname,'private.qr_command(jsonb)','EXECUTE'))
 then raise exception 'private_ACL_was_not_closed_reconcile'; end if;
end $correction_guard$;
create or replace function private.qr_command(_command jsonb) returns jsonb
language plpgsql volatile security definer set search_path='' set lock_timeout='3s' as $$
declare
 u uuid; action text; eid uuid; aid uuid; op uuid; fingerprint text; old private.qr_command_receipts;
 e public.events; a public.participations; o public.orders; p private.ticket_passes;
 outcome text; result jsonb; token text; fresh text; hash text; corr uuid:=gen_random_uuid();
 reason text; expected integer; lim private.qr_scan_limits; mutating boolean; managing boolean; t timestamptz;
 allowed text[]; num integer; prior_hash text;
begin
 if _command is null or jsonb_typeof(_command)<>'object' or octet_length(_command::text)>8192 then raise exception 'invalid_input' using errcode='22023'; end if;
 action:=_command->>'action';
 if action is null or action not in ('list','catalog','status','address','issue','rotate','revoke','verify','checkin') then raise exception 'invalid_action' using errcode='22023'; end if;
 allowed:=case
 when action in ('list','catalog') then array['action']
 when action in ('status','address') then array['action','eventId','participationId']
 when action in ('issue','rotate','revoke') then array['action','eventId','participationId','operationId','expectedVersion','reason']
 when action='verify' then array['action','eventId','token']
 else array['action','eventId','token','operationId','expectedVersion'] end;
 if exists(select 1 from jsonb_object_keys(_command) k where not k=any(allowed)) then raise exception 'invalid_input' using errcode='22023'; end if;
 u:=private.qr_require_actor();
 if action='list' then
  select coalesce(jsonb_agg(private.qr_pass_dto(part_row.id) order by event_row.starts_at),'[]'::jsonb) into result
  from public.participations part_row join public.events event_row on event_row.id=part_row.event_id where part_row.user_id=u and event_row.is_synthetic;
  return jsonb_build_object('items',result,'secretContract','explicit-rotation-v2');
 elsif action='catalog' then
  perform private.qr_require_mfa();
  select coalesce(jsonb_agg(jsonb_build_object('eventId',event_row.id,'eventTitle',event_row.title,'timezone',event_row.timezone) order by event_row.starts_at),'[]'::jsonb) into result
  from public.events event_row where event_row.is_synthetic and exists(select 1 from public.staff_assignments s where s.user_id=u and s.revoked_at is null
  and s.valid_from<=clock_timestamp() and (s.valid_until is null or s.valid_until>clock_timestamp())
  and (s.event_id is null or s.event_id=event_row.id) and s.role in ('owner','admin','scanner','shift_lead'));
  return jsonb_build_object('events',result);
 end if;
 eid:=(_command->>'eventId')::uuid;
 if eid is null then raise exception 'invalid_input' using errcode='22023'; end if;
 mutating:=action in ('issue','rotate','revoke','checkin');
 managing:=action in ('issue','rotate','revoke');
 if mutating then
  op:=(_command->>'operationId')::uuid;
  if op is null then raise exception 'invalid_input' using errcode='22023'; end if;
  expected:=(_command->>'expectedVersion')::integer;
  if expected is null or expected<0 then raise exception 'invalid_input' using errcode='22023'; end if;
 end if;
 if managing or action in ('status','address') then
  aid:=(_command->>'participationId')::uuid;
  select * into a from public.participations where id=aid and event_id=eid;
  if a.id is null then raise exception 'forbidden' using errcode='42501'; end if;
  if a.user_id<>u then
   if action<>'revoke' then raise exception 'forbidden' using errcode='42501'; end if;
   perform private.qr_require_staff(eid,true);
  end if;
  if managing then
   reason:=btrim(_command->>'reason');
   if reason is null or char_length(reason) not between 3 and 300 or reason ~ 'VNE[12]:' then raise exception 'invalid_reason' using errcode='22023'; end if;
  end if;
 else
  perform private.qr_require_staff(eid,false);
  token:=_command->>'token';
  if token is null or token !~ '^VNE2:[A-Za-z0-9_-]{43}$' then outcome:='invalid_token'; end if;
  hash:=private.qr_hash(coalesce(case when outcome is null then substr(token,6) else token end,''));
 end if;
 -- Save only a digest of the command. The original QR never enters a log or receipt table.
 fingerprint:=private.qr_hash((_command-'token'||case when token is null then '{}'::jsonb else jsonb_build_object('scanHash',hash) end)::text);
 if mutating then
  perform pg_advisory_xact_lock(hashtextextended('vne.qr.v2:'||u::text||op::text,0));
  select * into old from private.qr_command_receipts where actor=u and operation_id=op;
  if found then
   if old.action<>action or old.fingerprint<>fingerprint then raise exception 'idempotency_conflict' using errcode='22023'; end if;
   return jsonb_build_object('receipt',old.receipt,'replayed',true,'secretUnavailable',true);
  end if;
 end if;
 -- Invalid scans are rate-limited in the same authoritative DB, across worker instances.
 if action in ('verify','checkin') then
  insert into private.qr_scan_limits(actor,window_started_at,attempts) values(u,clock_timestamp(),1)
  on conflict(actor) do update set attempts=case when qr_scan_limits.window_started_at<=clock_timestamp()-interval '1 minute' then 1 else qr_scan_limits.attempts+1 end,
  window_started_at=case when qr_scan_limits.window_started_at<=clock_timestamp()-interval '1 minute' then clock_timestamp() else qr_scan_limits.window_started_at end
  returning * into lim;
  if lim.attempts>30 then outcome:='rate_limited'; end if;
 end if;
 select * into e from public.events where id=eid for update;
 if e.id is null then raise exception 'forbidden' using errcode='42501'; end if;
 -- Canonical lock order: event -> order -> participation -> pass.
 if action in ('verify','checkin') and outcome is null then
  select * into p from private.ticket_passes where event_id=eid and scan_token_hash=hash and token_key_version='explicit-v2';
  if p.id is null then
   if exists(select 1 from private.qr_token_history h join private.ticket_passes tp on tp.id=h.pass_id where h.token_hash=hash and tp.event_id=eid) then outcome:='replaced';
   else outcome:='not_found'; end if;
  else aid:=p.participation_id; end if;
 end if;
 if aid is not null then
  select * into a from public.participations where id=aid;
  select * into o from public.orders where id=a.order_id for update;
  select * into a from public.participations where id=aid for update;
  select * into p from private.ticket_passes where participation_id=aid for update;
 end if;
 -- Revalidate identity and authority after any lock wait.
 perform private.qr_require_actor();
 if action in ('verify','checkin') then perform private.qr_require_staff(eid,false);
 elsif a.user_id<>u then perform private.qr_require_staff(eid,true); end if;
 t:=clock_timestamp();
 if outcome is null then outcome:=private.qr_outcome(aid); end if;
 if action in ('status','address') then
  if action='status' then return jsonb_build_object('pass',private.qr_pass_dto(aid)); end if;
  if outcome<>'eligible' then return jsonb_build_object('outcome',outcome,'addressAvailable',false); end if;
  if t<e.address_reveal_at then return jsonb_build_object('outcome','before_reveal','addressAvailable',false,'addressRevealAt',e.address_reveal_at,'timezone',e.timezone); end if;
  select venue_address into fresh from private.event_private_details where event_id=eid;
  return jsonb_build_object('outcome',case when fresh is null then 'address_unconfigured' else 'ready' end,'addressAvailable',fresh is not null,'address',fresh);
 end if;
 if outcome='eligible' and exists(select 1 from private.ticket_checkins where participation_id=aid) then outcome:='used'; end if;
 if outcome='eligible' and managing and p.id is not null and p.token_key_version<>'explicit-v2' then outcome:='legacy_disabled'; end if;
 if outcome='eligible' then
  if action in ('issue','rotate','verify','checkin') and t<e.qr_release_at then outcome:='before_release';
  elsif action in ('verify','checkin') and t<e.entry_opens_at then outcome:='too_early';
  elsif action in ('verify','checkin') and (p.status='revoked' or p.status='used') then outcome:=p.status;
  elsif action in ('verify','checkin') and t>=p.valid_until then outcome:='expired';
  elsif mutating and coalesce(p.version,0)<>expected then outcome:='version_conflict';
  elsif action='issue' and p.id is not null then outcome:='already_issued';
  elsif action in ('rotate','revoke') and p.id is null then outcome:='not_found';
  elsif action='rotate' and p.status='revoked' then outcome:='revoked'; end if;
 end if;
 if outcome='eligible' then
  if action in ('issue','rotate') then
   fresh:=rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=');
   if action='issue' then
    select coalesce(max(sequence_number),0)+1 into num from private.ticket_passes where event_id=eid;
    insert into private.ticket_passes(id,event_id,participation_id,user_id,guest_name,source,environment,access,reason,sequence_number,
    token_key_version,view_token_hash,scan_token_hash,valid_until,event_snapshot,issued_by)
    values(gen_random_uuid(),eid,aid,a.user_id,'TEST participant','participation','sandbox','GENERAL',reason,num,
    'explicit-v2',private.qr_hash(rtrim(translate(encode(extensions.gen_random_bytes(32),'base64'),'+/','-_'),'=')),private.qr_hash(fresh),e.entry_closes_at,
    jsonb_build_object('id',e.id,'title',e.title,'timezone',e.timezone,'when',e.starts_at),u) returning * into p;
   else
    insert into private.qr_token_history(pass_id,generation,token_hash,reason) values(p.id,p.generation,p.scan_token_hash,reason);
    update private.ticket_passes set scan_token_hash=private.qr_hash(fresh),generation=generation+1,version=version+1 where id=p.id returning * into p;
   end if;
   outcome:=case when action='issue' then 'issued' else 'rotated' end;
   insert into private.outbox(topic,payload,status) values('qr.ready',jsonb_build_object('participationId',aid,'eventId',eid,'passId',p.id,'operationId',op,'generation',p.generation),'held');
  elsif action='revoke' then
   update private.ticket_passes set status='revoked',revoked_at=t,version=version+1 where id=p.id returning * into p;
   outcome:='revoked';
  elsif action='checkin' then
   insert into private.ticket_checkins(pass_id,event_id,actor,operation_id,checked_at,participation_id) values(p.id,eid,u,op,t,aid);
   update private.ticket_passes set status='used',used_at=t,version=version+1 where id=p.id returning * into p;
   outcome:='simulated_accepted';
  else outcome:='ready'; end if;
 end if;
 result:=jsonb_build_object('operationId',op,'correlationId',corr,'action',action,'outcome',outcome,'eventId',eid,
 'participationId',aid,'passId',p.id,'generation',p.generation,'version',p.version,'actorId',u,'at',t,'simulated',true,'reentryAllowed',false);
 insert into private.ticket_events(pass_id,event_id,actor,action,outcome,detail,correlation_id,operation_id)
 values(p.id,eid,u,'qr.v2.'||action,outcome,case when managing then reason else null end,corr,op);
 insert into private.audit_log(actor,action,object_type,object_id,result,correlation_id,details)
 values(u,'qr.v2.'||action,'participation',aid,case when outcome in ('issued','rotated','revoked','simulated_accepted','ready') then 'ok' else 'denied' end,corr,
 jsonb_build_object('operationId',op,'eventId',eid,'participationId',aid,'passId',p.id,'outcome',outcome));
 if mutating then
  insert into private.qr_command_receipts(actor,operation_id,action,fingerprint,event_id,participation_id,receipt) values(u,op,action,fingerprint,eid,aid,result);
 end if;
 return jsonb_build_object('receipt',result,'replayed',false,'secretUnavailable',fresh is null)
 ||case when action in ('issue','rotate') and outcome in ('issued','rotated') then jsonb_build_object('qrText','VNE2:'||fresh) else '{}'::jsonb end;
end $$;
-- CREATE OR REPLACE preserves existing ACL; explicitly keep known API roles closed.
revoke all on function private.qr_command(jsonb) from PUBLIC,anon,authenticated,service_role;
do $correction_check$
begin
 if exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated','service_role')
 and has_function_privilege(r.rolname,'private.qr_command(jsonb)','EXECUTE'))
 then raise exception 'private_ACL_must_remain_closed'; end if;
 if not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.qr_command(jsonb)')
 and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='ad5e6d8a373ad9a93bcce234e3a7d640bd423717966c821837485357acc2f5bf')
 then raise exception 'corrected_private_body_digest_mismatch'; end if;
 if not exists(select 1 from private.qr_admission_config where singleton and not enabled and not synthetic_admission)
 or to_regprocedure('public.vne_qr_command(jsonb)') is not null then raise exception 'closed_state_must_be_preserved'; end if;
end $correction_check$;
commit;

