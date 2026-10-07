-- Ticket issuer: canonical event references, no duplicate guest/event database.
-- Applying this migration does not issue passes or enable external delivery.
create table private.ticket_passes (
 id uuid primary key,
 event_id uuid not null references public.events(id) on delete restrict,
 participation_id uuid unique references public.participations(id) on delete restrict,
 user_id uuid,
 guest_name text not null check(char_length(guest_name) between 1 and 80),
 source text not null check(source in ('manual','participation')),
 environment text not null check(environment in ('sandbox','live')),
 access text not null check(access in ('GENERAL','VIP','SECURITY','ARTIST')),
 reason text not null check(char_length(reason) between 3 and 300),
 sequence_number integer not null check(sequence_number > 0),
 status text not null default 'active' check(status in ('active','revoked','used')),
 version integer not null default 1,
 generation integer not null default 1,
 token_key_version text not null,
 view_token_hash text not null unique check(view_token_hash ~ '^[a-f0-9]{64}$'),
 scan_token_hash text not null unique check(scan_token_hash ~ '^[a-f0-9]{64}$'),
 valid_until timestamptz not null,
 event_snapshot jsonb not null,
 design jsonb,
 issued_by uuid not null,
 issued_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz,
 used_at timestamptz,
 unique(event_id,sequence_number),
 check((source='manual' and participation_id is null) or (source='participation' and participation_id is not null))
);
create index ticket_passes_event on private.ticket_passes(event_id,issued_at desc);
create table private.ticket_operations (
 actor uuid not null,
 operation_id uuid not null,
 kind text not null,
 request_body jsonb not null,
 pass_id uuid not null references private.ticket_passes(id),
 created_at timestamptz not null default clock_timestamp(),
 primary key(actor,operation_id)
);
create table private.ticket_events (
 id bigint generated always as identity primary key,
 pass_id uuid references private.ticket_passes(id),
 event_id uuid not null references public.events(id),
 actor uuid not null,
 action text not null,
 outcome text not null,
 detail text,
 occurred_at timestamptz not null default clock_timestamp()
);
create index ticket_events_pass on private.ticket_events(pass_id,id desc);
create table private.ticket_checkins (
 pass_id uuid primary key references private.ticket_passes(id),
 event_id uuid not null references public.events(id),
 actor uuid not null,
 operation_id uuid not null,
 checked_at timestamptz not null default clock_timestamp(),
 unique(actor,operation_id)
);
alter table private.ticket_passes enable row level security;
alter table private.ticket_operations enable row level security;
alter table private.ticket_events enable row level security;
alter table private.ticket_checkins enable row level security;
revoke all on private.ticket_passes,private.ticket_operations,private.ticket_events,private.ticket_checkins from public,anon,authenticated;

-- Existing reservation/payment flow and manual issuance share one capacity count.
-- A used pass still occupies a seat. Revoking a manual pass releases its seat;
-- sequence numbers are never reused. Paid participations are not counted twice.
create or replace function private.seats_taken(_event uuid) returns integer
language sql stable security definer set search_path='' as $$
 select (select count(*) from public.participations p where p.event_id=_event and p.status='active')::int
 +(select count(*) from public.reservations r where r.event_id=_event and r.status='active' and r.expires_at>clock_timestamp())::int
 +(select count(*) from private.ticket_passes p where p.event_id=_event and p.source='manual' and p.status in ('active','used'))::int
$$;

-- Wall-clock expiry is checked again after row-lock waits.
create function private.ticket_live_role(_event uuid,_scan boolean) returns boolean
language sql volatile security definer set search_path='' as $$
 select private.staff_session_ok()
 and exists(select 1 from auth.sessions s where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=auth.uid() and (s.not_after is null or s.not_after>clock_timestamp()))
 and exists(select 1 from public.staff_assignments a where a.user_id=auth.uid() and a.revoked_at is null
 and a.valid_from<=clock_timestamp() and (a.valid_until is null or a.valid_until>clock_timestamp())
 and (a.event_id is null or a.event_id=_event)
 and (a.role in ('owner','admin') or (_scan and a.role in ('scanner','shift_lead'))))
$$;
revoke all on function private.ticket_live_role(uuid,boolean) from public,anon,authenticated;

create function private.ticket_scan_allowed(_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.staff_session_ok()
 and private.ticket_live_role(_event,true)
$$;

create function private.ticket_dto(_id uuid) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare p private.ticket_passes; e public.events; v_status text; t timestamptz:=clock_timestamp(); eligible boolean;
begin
 select * into p from private.ticket_passes where id=_id;
 if not found then return null; end if;
 select * into e from public.events where id=p.event_id;
 v_status:=p.status;
 if v_status='active' and (e.status<>'published' or e.cancelled_at is not null or
   (p.participation_id is not null and not exists(
    select 1 from public.participations a join public.orders o on o.id=a.order_id
    where a.id=p.participation_id and a.status='active' and o.status='paid'
    and a.event_id=p.event_id and o.event_id=p.event_id and a.user_id=p.user_id and o.user_id=p.user_id
    and o.environment=p.environment))) then v_status:='revoked'; end if;
 if v_status='active' and (t>=p.valid_until or (e.entry_closes_at is not null and t>=e.entry_closes_at)) then v_status:='expired'; end if;
 eligible:=v_status='active' and e.qr_release_at is not null and t>=e.qr_release_at;
 return jsonb_build_object('id',p.id,'ticketCode','VNE-'||upper(p.id::text),'userId',coalesce(p.user_id::text,''),
  'name',p.guest_name,'telegram',null,'access',p.access,'theme','ember','sequenceNumber',p.sequence_number,
  'sequenceLabel',lpad(p.sequence_number::text,greatest(2,length(p.sequence_number::text)),'0')||'/'||(p.event_snapshot->>'totalTickets'),
  'event',p.event_snapshot,'status',v_status,'source',p.source,'demo',p.environment='sandbox',
  'environment',p.environment,'validUntil',p.valid_until,'qrReleaseAt',e.qr_release_at,
  'qrEligible',eligible,'generation',p.generation,'tokenKeyVersion',p.token_key_version,'version',p.version,'design',p.design);
end $$;

create function private.ticket_issue(_input jsonb,_id uuid,_view_hash text,_scan_hash text,_key_version text,_operation uuid) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid:=auth.uid(); e public.events; a public.participations; o public.orders; p private.ticket_passes;
 op private.ticket_operations; eid uuid; aid uuid; uname text; src text; envname text; expiry timestamptz; num integer; t timestamptz;
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
  return jsonb_build_object('pass',private.ticket_dto(op.pass_id),'duplicate',true);
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
 insert into private.ticket_events(pass_id,event_id,actor,action,outcome,detail) values(p.id,eid,u,'issue','issued',p.reason);
 insert into private.audit_log(actor,action,object_type,object_id,result,details) values(u,'ticket.issue','ticket',p.id,'ok',jsonb_build_object('event',eid,'source',src,'environment',envname));
 return jsonb_build_object('pass',private.ticket_dto(p.id),'duplicate',false);
end $$;

create function private.ticket_admin(_action text,_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid:=auth.uid(); p private.ticket_passes; op private.ticket_operations; eid uuid; result jsonb; reason text; t timestamptz;
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
  select coalesce(jsonb_agg(to_jsonb(s) order by s.id desc),'[]'::jsonb) into result
  from(select id,actor,action,outcome,detail,occurred_at from private.ticket_events where pass_id=p.id order by id desc limit 100)s;
  return jsonb_build_object('items',result);
 end if;
 if _action<>'revoke' then raise exception 'invalid_action'; end if;
 reason:=btrim(_input->>'reason');
 if reason is null or char_length(reason) not between 3 and 300 or nullif(_input->>'operationId','') is null then raise exception 'invalid_input'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(u::text||(_input->>'operationId'),0));
 select * into op from private.ticket_operations where actor=u and operation_id=(_input->>'operationId')::uuid;
 if found then
  if op.kind<>'revoke' or op.request_body<>_input then raise exception 'idempotency_conflict'; end if;
  return jsonb_build_object('pass',private.ticket_dto(op.pass_id),'duplicate',true);
 end if;
 perform 1 from public.events where id=p.event_id for update;
 select * into p from private.ticket_passes where id=p.id for update;
 if (not private.staff_can('events_manage') or not private.ticket_live_role(null,false)) then raise exception 'forbidden' using errcode='42501'; end if;
 if p.status='used' then raise exception 'already_used'; end if;
 if p.version<>coalesce((_input->>'expectedVersion')::int,0) then raise exception 'version_conflict'; end if;
 if p.status<>'revoked' then
  t:=clock_timestamp();update private.ticket_passes set status='revoked',revoked_at=t,version=version+1 where id=p.id;
  insert into private.ticket_events(pass_id,event_id,actor,action,outcome,detail) values(p.id,p.event_id,u,'revoke','revoked',reason);
  insert into private.audit_log(actor,action,object_type,object_id,result,details) values(u,'ticket.revoke','ticket',p.id,'ok',jsonb_build_object('event',p.event_id,'reason',reason));
 end if;
 insert into private.ticket_operations(actor,operation_id,kind,request_body,pass_id) values(u,(_input->>'operationId')::uuid,'revoke',_input,p.id);
 return jsonb_build_object('pass',private.ticket_dto(p.id),'duplicate',false);
end $$;

create function private.ticket_read(_token text) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare id uuid;
begin
 if _token is null or _token !~ '^[A-Za-z0-9_-]{43}$' then return null; end if;
 select p.id into id from private.ticket_passes p where p.view_token_hash=encode(sha256(convert_to(_token,'UTF8')),'hex');
 return private.ticket_dto(id);
end $$;

create function private.ticket_scan(_input jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid:=auth.uid(); eid uuid:=(_input->>'eventId')::uuid; p private.ticket_passes; e public.events;
 a public.participations; o public.orders; op private.ticket_operations; token text; outcome text; t timestamptz; consume boolean;
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
   return jsonb_build_object('outcome','accepted','replayed',true,'pass',private.ticket_dto(op.pass_id));
  end if;
 end if;
 select * into e from public.events where id=eid for update;
 select * into p from private.ticket_passes where event_id=eid and scan_token_hash=encode(sha256(convert_to(token,'UTF8')),'hex');
 if p.id is null then return jsonb_build_object('outcome','not_found'); end if;
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
  insert into private.audit_log(actor,action,object_type,object_id,result,details) values(u,'ticket.checkin','ticket',p.id,'ok',jsonb_build_object('event',eid));
  outcome:='accepted';
 end if;
 insert into private.ticket_events(pass_id,event_id,actor,action,outcome) values(p.id,eid,u,case when consume then 'checkin' else 'verify' end,outcome);
 return jsonb_build_object('outcome',outcome,'replayed',false,'pass',private.ticket_dto(p.id));
end $$;

-- Narrow wrappers; private implementations do all authorization and locking.
create function public.ticket_issue(_input jsonb,_id uuid,_view_hash text,_scan_hash text,_key_version text,_operation uuid) returns jsonb
language sql set search_path='' as $$select private.ticket_issue(_input,_id,_view_hash,_scan_hash,_key_version,_operation)$$;
create function public.ticket_admin(_action text,_input jsonb) returns jsonb language sql set search_path='' as $$select private.ticket_admin(_action,_input)$$;
-- Guest capability wrapper deliberately runs as owner; anon gets no private
-- schema usage and cannot call any other private helper.
create function public.ticket_read(_token text) returns jsonb language sql security definer set search_path='' as $$select private.ticket_read(_token)$$;
create function public.ticket_scan(_input jsonb) returns jsonb language sql set search_path='' as $$select private.ticket_scan(_input)$$;
revoke all on function private.ticket_dto(uuid),private.ticket_scan_allowed(uuid) from public,anon,authenticated;
revoke all on function private.ticket_issue(jsonb,uuid,text,text,text,uuid),private.ticket_admin(text,jsonb),private.ticket_scan(jsonb) from public,anon;
revoke all on function public.ticket_issue(jsonb,uuid,text,text,text,uuid),public.ticket_admin(text,jsonb),public.ticket_scan(jsonb) from public,anon;
grant execute on function private.ticket_issue(jsonb,uuid,text,text,text,uuid),private.ticket_admin(text,jsonb),private.ticket_scan(jsonb) to authenticated;
grant execute on function public.ticket_issue(jsonb,uuid,text,text,text,uuid),public.ticket_admin(text,jsonb),public.ticket_scan(jsonb) to authenticated;
revoke all on function private.ticket_read(text) from public,anon,authenticated;
revoke all on function public.ticket_read(text) from public;
grant execute on function public.ticket_read(text) to anon,authenticated;

-- Assigned scan staff see only events they are allowed to operate.
create function private.ticket_scan_catalog() returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare result jsonb;
begin
 if not private.staff_session_ok() then raise exception 'forbidden' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'startsAt',e.starts_at,'timezone',e.timezone,
 'synthetic',e.is_synthetic,'entryOpensAt',e.entry_opens_at,'entryClosesAt',e.entry_closes_at,'qrReleaseAt',e.qr_release_at) order by e.starts_at),'[]'::jsonb) into result
 from public.events e where private.ticket_scan_allowed(e.id) and e.status='published' and e.cancelled_at is null and (e.entry_closes_at is null or e.entry_closes_at>clock_timestamp());
 return jsonb_build_object('events',result);
end $$;
create function public.ticket_scan_catalog() returns jsonb language sql set search_path='' as $$select private.ticket_scan_catalog()$$;
revoke all on function public.ticket_scan_catalog(),private.ticket_scan_catalog() from public,anon;
grant execute on function public.ticket_scan_catalog(),private.ticket_scan_catalog() to authenticated;

-- Capacity serialization shared with existing payments.
create or replace function private.apply_payment_event(_provider text, _env text, _event_id text, _payment_id text,
  _order uuid, _kind text, _amount bigint, _currency text, _occurred_at timestamptz) returns text
language plpgsql security definer set search_path = '' as $$
declare o public.orders; r public.reservations; p public.payments; v_outcome text; rank_new int; rank_old int; v_event uuid; e public.events;
begin
  if _kind not in ('pending','succeeded','failed') then return 'invalid_kind'; end if;
  -- Serialize one delivery, including a retry that raced before the first commit.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'payment.event:' || jsonb_build_array(_provider, _env, _event_id)::text, 0));
  if exists (select 1 from public.payment_events where provider = _provider and environment = _env and provider_event_id = _event_id) then return 'duplicate'; end if;
  -- Shared seat-allocation mutex; always event BEFORE order/reservation.
  -- The initial lookup does not lock the order and cannot create a reverse lock dependency.
  select event_id into v_event from public.orders where id = _order;
  if not found then return 'unknown_order'; end if;
  select * into e from public.events where id = v_event for update;
  if not found then return 'unknown_order'; end if;
  select * into o from public.orders where id = _order for update;
  if not found then return 'unknown_order'; end if;
  if o.environment <> _env or o.amount_minor <> _amount or o.currency <> _currency then return 'mismatch'; end if;
  select * into p from public.payments where provider = _provider and environment = _env and provider_payment_id = _payment_id for update;
  if found and p.order_id <> o.id then return 'mismatch'; end if;
  if not found then
    insert into public.payments(order_id, provider, environment, provider_payment_id, amount_minor, currency, last_event_at)
      values (o.id, _provider, _env, _payment_id, _amount, _currency, _occurred_at) returning * into p;
  end if;
  -- monotonic reconciliation: pending(0) < failed(1) < succeeded(2); refunded is terminal and set only by refund
  rank_new := case _kind when 'pending' then 0 when 'failed' then 1 else 2 end;
  rank_old := case p.status when 'pending' then 0 when 'failed' then 1 when 'succeeded' then 2 else 3 end;
  if rank_new <= rank_old and not (rank_new = 0 and rank_old = 0) then
    v_outcome := 'stale';
  elsif _kind = 'pending' then
    v_outcome := 'pending';
  else
    update public.payments set status = _kind::public.payment_status, last_event_at = _occurred_at, updated_at = now() where id = p.id;
    select * into r from public.reservations where id = o.reservation_id for update;
    if _kind = 'failed' then
      if o.status = 'awaiting_payment' then
        update public.orders set status = 'failed', updated_at = now(), version = version + 1 where id = o.id;
        update public.reservations set status = 'cancelled', updated_at = now() where id = r.id and status = 'active';
      end if;
      v_outcome := 'failed';
    elsif o.status = 'awaiting_payment' and r.status = 'active' and r.expires_at > clock_timestamp() then
      update public.orders set status = 'paid', updated_at = now(), version = version + 1 where id = o.id;
      update public.reservations set status = 'converted', updated_at = now() where id = r.id;
      insert into public.participations(order_id, event_id, user_id) values (o.id, o.event_id, o.user_id);
      insert into private.outbox(topic, payload, status) values ('participation.confirmed', jsonb_build_object('order', o.id), 'held');
      v_outcome := 'paid';
    elsif o.status = 'paid' then
      v_outcome := 'already_paid';
    else
      -- late / after cancel / after failure: never grant a seat over capacity automatically
      update public.orders set status = 'needs_review', review_reason = 'late_payment:' || o.status::text, updated_at = now(), version = version + 1 where id = o.id;
      if r.status = 'active' then update public.reservations set status = 'expired', updated_at = now() where id = r.id; end if;
      insert into private.outbox(topic, payload, status) values ('order.needs_review', jsonb_build_object('order', o.id), 'held');
      v_outcome := 'needs_review';
    end if;
  end if;
  insert into public.payment_events(provider, environment, provider_event_id, provider_payment_id, order_id, kind, amount_minor, currency, occurred_at, outcome)
    values (_provider, _env, _event_id, _payment_id, o.id, _kind, _amount, _currency, _occurred_at, v_outcome);
  insert into private.audit_log(action, object_type, object_id, result, details)
    values ('payment.event', 'order', o.id, case when v_outcome in ('stale','already_paid') then 'noop' else 'ok' end,
      jsonb_build_object('kind', _kind, 'outcome', v_outcome, 'provider', _provider, 'env', _env));
  return v_outcome;
end $$;

-- Used tickets continue to occupy capacity after a full participation refund.
-- An active participation already occupies its seat and must not be counted twice.
create or replace function private.seats_taken(_event uuid) returns integer
language sql stable security definer set search_path='' as $$
 select (select count(*) from public.participations p where p.event_id=_event and p.status='active')::int
 +(select count(*) from public.reservations r where r.event_id=_event and r.status='active' and r.expires_at>clock_timestamp())::int
 +(select count(*) from private.ticket_passes p where p.event_id=_event and p.source='manual' and p.status in ('active','used'))::int
 +(select count(*) from private.ticket_passes tp
   where tp.event_id=_event and tp.source='participation' and tp.status='used'
   and not exists(select 1 from public.participations p where p.id=tp.participation_id and p.status='active'))::int
$$;
