-- REVIEW CANDIDATE ONLY. Apply only after reviewed baseline and target confirmation.
-- Three additive nullable columns; no defaults, backfill, PK/FK/RLS/grant changes.
alter table public.application_events add column correlation_id uuid;
alter table private.ticket_events add column correlation_id uuid, add column operation_id uuid;
create index application_events_correlation_id on public.application_events(correlation_id) where correlation_id is not null;
create index ticket_events_correlation_id_time on private.ticket_events(correlation_id,occurred_at);
create index ticket_events_actor_operation_id on private.ticket_events(actor,operation_id) where operation_id is not null;
create index audit_log_correlation_id_time on private.audit_log(correlation_id,at);


create or replace function private.log_app(_app uuid, _from public.application_status, _to public.application_status, _msg text, _action text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_corr uuid := gen_random_uuid();
begin
  insert into public.application_events(application_id, from_status, to_status, public_message, correlation_id) values (_app, _from, _to, _msg, v_corr);
  insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
    values (auth.uid(), _action, 'application', _app, 'ok', v_corr, jsonb_build_object('from', _from, 'to', _to));
  insert into private.outbox(topic, payload, status)
    values ('application.status_changed', jsonb_build_object('application_id', _app, 'to', _to, 'correlation_id', v_corr), 'held');
end $$;

create or replace function private.log_app2(_app uuid, _from public.application_status, _to public.application_status, _msg text, _guest text, _action text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_corr uuid := gen_random_uuid();
begin
  insert into public.application_events(application_id, from_status, to_status, public_message, guest_message, correlation_id) values (_app, _from, _to, _msg, _guest, v_corr);
  insert into private.audit_log(actor, action, object_type, object_id, result, correlation_id, details)
    values (auth.uid(), _action, 'application', _app, 'ok', v_corr, jsonb_build_object('from', _from, 'to', _to));
  insert into private.outbox(topic, payload, status)
    values ('application.status_changed', jsonb_build_object('application_id', _app, 'to', _to, 'correlation_id', v_corr), 'held');
end $$;

create or replace function private.ticket_issue(_input jsonb,_id uuid,_view_hash text,_scan_hash text,_key_version text,_operation uuid) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid:=auth.uid(); e public.events; a public.participations; o public.orders; p private.ticket_passes;
 op private.ticket_operations; eid uuid; aid uuid; uname text; src text; envname text; expiry timestamptz; num integer; t timestamptz; v_corr uuid; v_event bigint; ev private.ticket_events;
begin
 if u is null or (not private.staff_can('events_manage') or not private.ticket_live_role(null,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 if _operation is null or _id is null or _input is null or jsonb_typeof(_input)<>'object'
 or _view_hash is null or _view_hash !~ '^[a-f0-9]{64}$' or _scan_hash is null or _scan_hash !~ '^[a-f0-9]{64}$'
 or _key_version is null or _key_version !~ '^[A-Za-z0-9_-]{1,24}$' then raise exception 'invalid_input'; end if;
 if coalesce(_input->>'access','') not in ('GENERAL','VIP','SECURITY','ARTIST')
 or char_length(coalesce(_input->>'reason','')) not between 3 and 300 then raise exception 'invalid_input'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||_operation::text,0));
 select * into op from private.ticket_operations where actor=u and operation_id=_operation;
 if found then
  if op.kind<>'issue' or op.request_body<>_input then raise exception 'idempotency_conflict'; end if;
  select * into ev from private.ticket_events where actor=u and operation_id=_operation and pass_id=op.pass_id and action='issue' order by id limit 1;
  return jsonb_build_object('pass',private.ticket_dto(op.pass_id),'duplicate',true,'issuanceId',ev.id::text,'correlationId',ev.correlation_id,'operationId',_operation);
 end if;
 eid:=(_input->>'eventId')::uuid; aid:=nullif(_input->>'participationId','')::uuid;
 select * into e from public.events where id=eid for update;
 if not found then raise exception 'event_not_found'; end if;
 if aid is not null then
  select * into a from public.participations where id=aid;
  select * into o from public.orders where id=a.order_id for update;
  select * into a from public.participations where id=aid for update;
  if a.id is null or o.id is null or a.event_id<>eid or o.event_id<>eid or a.user_id<>o.user_id
   or a.status<>'active' or o.status<>'paid' then raise exception 'participation_inactive'; end if;
  src:='participation'; envname:=o.environment;
  select coalesce(nullif(btrim(display_name),''),'Участник') into uname from public.profiles where id=a.user_id;
  uname:=coalesce(uname,'Участник');
  if exists(select 1 from private.ticket_passes where participation_id=aid) then raise exception 'ticket_exists'; end if;
 else
  src:='manual'; envname:=case when e.is_synthetic then 'sandbox' else 'live' end;
  uname:=btrim(_input->>'name');
  if uname is null or char_length(uname) not between 1 and 80 then raise exception 'invalid_name'; end if;
  if e.capacity is null or private.seats_taken(eid)>=e.capacity then raise exception 'event_capacity_reached'; end if;
 end if;
 -- Recheck after waiting on locks. Never turn a stale staff session into a pass.
 if (not private.staff_can('events_manage') or not private.ticket_live_role(null,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 t:=clock_timestamp();
 if e.status<>'published' or e.cancelled_at is not null then raise exception 'event_unavailable'; end if;
 if e.entry_opens_at is null or e.entry_closes_at is null or e.qr_release_at is null or e.capacity is null
 or e.entry_closes_at<=t or e.entry_closes_at<=e.entry_opens_at or e.qr_release_at>e.entry_opens_at then raise exception 'event_window_required'; end if;
 expiry:=coalesce(nullif(_input->>'validUntil','')::timestamptz,e.entry_closes_at);
 if expiry<=t or expiry>e.entry_closes_at or expiry<=e.entry_opens_at then raise exception 'invalid_valid_until'; end if;
 if _input->'design' is not null and _input->'design'<>'null'::jsonb then
  if jsonb_typeof(_input->'design')<>'object' or pg_catalog.octet_length((_input->'design')::text)>4000 then raise exception 'invalid_design'; end if;
 end if;
 select coalesce(max(sequence_number),0)+1 into num from private.ticket_passes where event_id=eid;
 insert into private.ticket_passes(id,event_id,participation_id,user_id,guest_name,source,environment,access,reason,sequence_number,
 token_key_version,view_token_hash,scan_token_hash,valid_until,event_snapshot,design,issued_by)
 values(_id,eid,aid,case when aid is null then null else a.user_id end,uname,src,envname,_input->>'access',_input->>'reason',num,
 _key_version,_view_hash,_scan_hash,expiry,jsonb_build_object('id',e.id,'title',e.title,
 'date',to_char(e.starts_at at time zone e.timezone,'YYYY-MM-DD'),'when',e.starts_at,'timezone',e.timezone,'totalTickets',e.capacity),
 nullif(_input->'design','null'::jsonb),u) returning * into p;
 insert into private.ticket_operations(actor,operation_id,kind,request_body,pass_id) values(u,_operation,'issue',_input,p.id);
 v_corr:=gen_random_uuid();
 insert into private.ticket_events(pass_id,event_id,actor,action,outcome,detail,correlation_id,operation_id) values(p.id,eid,u,'issue','issued',p.reason,v_corr,_operation) returning id into v_event;
 insert into private.audit_log(actor,action,object_type,object_id,result,correlation_id,details) values(u,'ticket.issue','ticket',p.id,'ok',v_corr,jsonb_build_object('event',eid,'source',src,'environment',envname));
 return jsonb_build_object('pass',private.ticket_dto(p.id),'duplicate',false,'issuanceId',v_event::text,'correlationId',v_corr,'operationId',_operation);
end $$;

create or replace function private.ticket_admin(_action text,_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid:=auth.uid(); p private.ticket_passes; op private.ticket_operations; eid uuid; result jsonb; reason text; t timestamptz; v_corr uuid; ev private.ticket_events;
begin
 if u is null or (not private.staff_can('events_manage') or not private.ticket_live_role(null,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 if _action='catalog' then
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'startsAt',e.starts_at,'timezone',e.timezone,
   'capacity',e.capacity,'taken',private.seats_taken(e.id),'synthetic',e.is_synthetic,'entryOpensAt',e.entry_opens_at,
   'entryClosesAt',e.entry_closes_at,'qrReleaseAt',e.qr_release_at) order by e.starts_at), '[]'::jsonb) into result
  from public.events e where e.status='published' and e.cancelled_at is null and (e.entry_closes_at is null or e.entry_closes_at>clock_timestamp());
  return jsonb_build_object('events',result);
 elsif _action='list' then
  eid:=nullif(_input->>'eventId','')::uuid;
  select coalesce(jsonb_agg(private.ticket_dto(s.id) order by s.issued_at desc),'[]'::jsonb) into result
  from (select id,issued_at from private.ticket_passes where (eid is null or event_id=eid)
   and (coalesce(_input->>'query','')='' or guest_name ilike '%'||left(_input->>'query',80)||'%')
   order by issued_at desc,id limit 50 offset greatest(0,least(coalesce((_input->>'page')::int,0),10000))*50) s;
  return jsonb_build_object('items',result);
 end if;
 select * into p from private.ticket_passes where id=(_input->>'id')::uuid;
 if not found then raise exception 'pass_not_found'; end if;
 if _action='get' then return jsonb_build_object('pass',private.ticket_dto(p.id)); end if;
 if _action='history' then
  select coalesce(jsonb_agg((to_jsonb(s)||jsonb_build_object('id',s.id::text)) order by s.id desc),'[]'::jsonb) into result
  from(select id,actor,action,outcome,detail,occurred_at,correlation_id,operation_id from private.ticket_events where pass_id=p.id order by id desc limit 100)s;
  return jsonb_build_object('items',result);
 end if;
 if _action<>'revoke' then raise exception 'invalid_action'; end if;
 reason:=btrim(_input->>'reason');
 if reason is null or char_length(reason) not between 3 and 300 or nullif(_input->>'operationId','') is null then raise exception 'invalid_input'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||(_input->>'operationId'),0));
 select * into op from private.ticket_operations where actor=u and operation_id=(_input->>'operationId')::uuid;
 if found then
  if op.kind<>'revoke' or op.request_body<>_input then raise exception 'idempotency_conflict'; end if;
  select * into ev from private.ticket_events where actor=u and operation_id=op.operation_id and pass_id=op.pass_id and action='revoke' order by id limit 1;
  return jsonb_build_object('pass',private.ticket_dto(op.pass_id),'duplicate',true,'correlationId',ev.correlation_id,'operationId',op.operation_id);
 end if;
 perform 1 from public.events where id=p.event_id for update;
 select * into p from private.ticket_passes where id=p.id for update;
 if (not private.staff_can('events_manage') or not private.ticket_live_role(null,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 if p.status='used' then raise exception 'already_used'; end if;
 if p.version<>coalesce((_input->>'expectedVersion')::int,0) then raise exception 'version_conflict'; end if;
 if p.status<>'revoked' then
  t:=clock_timestamp();update private.ticket_passes set status='revoked',revoked_at=t,version=version+1 where id=p.id;
 end if;
 v_corr:=gen_random_uuid();
 insert into private.ticket_events(pass_id,event_id,actor,action,outcome,detail,correlation_id,operation_id) values(p.id,p.event_id,u,'revoke',case when p.status='revoked' then 'already_revoked' else 'revoked' end,reason,v_corr,(_input->>'operationId')::uuid);
  insert into private.audit_log(actor,action,object_type,object_id,result,correlation_id,details) values(u,'ticket.revoke','ticket',p.id,case when p.status='revoked' then 'noop' else 'ok' end,v_corr,jsonb_build_object('event',p.event_id,'reason',reason));
 insert into private.ticket_operations(actor,operation_id,kind,request_body,pass_id) values(u,(_input->>'operationId')::uuid,'revoke',_input,p.id);
 return jsonb_build_object('pass',private.ticket_dto(p.id),'duplicate',false,'correlationId',v_corr,'operationId',(_input->>'operationId')::uuid);
end $$;

create or replace function private.ticket_scan(_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid:=auth.uid(); eid uuid:=(_input->>'eventId')::uuid; p private.ticket_passes; e public.events;
 a public.participations; o public.orders; op private.ticket_operations; token text; outcome text; t timestamptz; consume boolean; v_corr uuid; v_operation uuid; ev private.ticket_events;
begin
 if not private.ticket_scan_allowed(eid) then raise exception 'forbidden' using errcode='42501'; end if;
 consume:=coalesce((_input->>'consume')::boolean,false);token:=_input->>'token';
 if token is null or token !~ '^[A-Za-z0-9_-]{43}$' then raise exception 'invalid_token'; end if;
 if consume then
  if nullif(_input->>'operationId','') is null then raise exception 'invalid_input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||(_input->>'operationId'),0));
  select * into op from private.ticket_operations where actor=u and operation_id=(_input->>'operationId')::uuid;
  if found then
   -- Stored command never contains a raw token.
   if op.kind<>'checkin' or op.request_body<>jsonb_build_object('eventId',eid,'scanHash',encode(sha256(convert_to(token,'UTF8')),'hex'),'expectedVersion',_input->'expectedVersion') then raise exception 'idempotency_conflict'; end if;
   select * into ev from private.ticket_events te where te.actor=u and te.operation_id=op.operation_id and te.pass_id=op.pass_id and te.action='checkin' and te.outcome='accepted' order by te.id limit 1;
   return jsonb_build_object('outcome','accepted','replayed',true,'pass',private.ticket_dto(op.pass_id),'correlationId',ev.correlation_id,'operationId',op.operation_id);
  end if;
 end if;
 v_operation:=case when consume then (_input->>'operationId')::uuid else null end;
 select * into e from public.events where id=eid for update;
 if not private.ticket_scan_allowed(eid) then raise exception 'forbidden' using errcode='42501'; end if;
 if not found or e.id is null then return jsonb_build_object('outcome','not_found'); end if;
 v_corr:=gen_random_uuid();
 select * into p from private.ticket_passes where event_id=eid and scan_token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
 if p.id is null then
  insert into private.ticket_events(pass_id,event_id,actor,action,outcome,correlation_id,operation_id) values(null,eid,u,case when consume then 'checkin' else 'verify' end,'not_found',v_corr,v_operation);
  return jsonb_build_object('outcome','not_found','correlationId',v_corr,'operationId',v_operation);
 end if;
 if p.participation_id is not null then
  select * into a from public.participations where id=p.participation_id;
  select * into o from public.orders where id=a.order_id for update;
  select * into a from public.participations where id=p.participation_id for update;
 end if;
 select * into p from private.ticket_passes where id=p.id for update;
 t:=clock_timestamp();
 if not private.ticket_scan_allowed(eid) then raise exception 'forbidden' using errcode='42501'; end if;
 outcome:=case
  when p.environment<>'live' or e.is_synthetic then 'sandbox'
  when e.status<>'published' or e.cancelled_at is not null then 'event_unavailable'
  when p.status='revoked' then 'revoked'
  when p.status='used' then 'used'
  when p.participation_id is not null and (a.id is null or o.id is null or a.status<>'active' or o.status<>'paid'
   or a.event_id<>eid or o.event_id<>eid or a.user_id<>p.user_id or o.user_id<>p.user_id or o.environment<>p.environment) then 'revoked'
  when t>=p.valid_until then 'expired'
  when e.entry_opens_at is null or e.entry_closes_at is null or e.qr_release_at is null then 'window_required'
  when t<e.entry_opens_at or t<e.qr_release_at then 'too_early'
  when t>=e.entry_closes_at then 'expired'
  when consume and p.version<>coalesce((_input->>'expectedVersion')::int,0) then 'version_conflict'
  else 'ready' end;
 if consume and outcome='ready' then
  update private.ticket_passes set status='used',used_at=t,version=version+1 where id=p.id and status='active';
  insert into private.ticket_checkins(pass_id,event_id,actor,operation_id,checked_at) values(p.id,eid,u,(_input->>'operationId')::uuid,t);
  insert into private.ticket_operations(actor,operation_id,kind,request_body,pass_id)
   values(u,(_input->>'operationId')::uuid,'checkin',jsonb_build_object('eventId',eid,'scanHash',p.scan_token_hash,'expectedVersion',_input->'expectedVersion'),p.id);
  insert into private.audit_log(actor,action,object_type,object_id,result,correlation_id,details) values(u,'ticket.checkin','ticket',p.id,'ok',v_corr,jsonb_build_object('event',eid));
  outcome:='accepted';
 end if;
 insert into private.ticket_events(pass_id,event_id,actor,action,outcome,correlation_id,operation_id) values(p.id,eid,u,case when consume then 'checkin' else 'verify' end,outcome,v_corr,v_operation);
 return jsonb_build_object('outcome',outcome,'replayed',false,'pass',private.ticket_dto(p.id),'correlationId',v_corr,'operationId',v_operation);
end $$;

