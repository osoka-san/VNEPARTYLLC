-- PROPOSAL ONLY. Exact TEST baseline + ID trace extension. No remote application authorized.
-- This file intentionally creates no public RPC or client grants and enables no runtime.
begin;
set local search_path='';
set local lock_timeout='3s';
create table private.qr_admission_config (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 project_ref text not null check(project_ref='xrocuwlofxhxoxajukne'),
 synthetic_admission boolean not null default false
);
insert into private.qr_admission_config(singleton,project_ref) values(true,'xrocuwlofxhxoxajukne');
create table private.qr_command_receipts (
 actor uuid not null, operation_id uuid not null, action text not null,
 fingerprint text not null check(fingerprint ~ '^[a-f0-9]{64}$'),
 event_id uuid not null references public.events(id), participation_id uuid references public.participations(id),
 receipt jsonb not null check(not receipt ? 'qrText' and not receipt ? 'token'),
 created_at timestamptz not null default clock_timestamp(),
 backend_pid integer not null default pg_backend_pid(), statement_started_at timestamptz not null default statement_timestamp(),
 primary key(actor,operation_id)
);
create table private.qr_token_history (
 pass_id uuid not null references private.ticket_passes(id), generation integer not null,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 revoked_at timestamptz not null default clock_timestamp(), reason text not null,
 primary key(pass_id,generation)
);
create table private.qr_scan_limits (
 actor uuid primary key, window_started_at timestamptz not null, attempts integer not null check(attempts>=0)
);
create table private.event_private_details (
 event_id uuid primary key references public.events(id) on delete restrict,
 venue_address text not null check(char_length(venue_address)<=500),
 updated_at timestamptz not null default clock_timestamp()
);
-- Primary admission is independent of QR generation. Legacy manual records may have NULL;
-- the new API always requires a canonical participation and never issues manual passes.
alter table private.ticket_checkins add column participation_id uuid references public.participations(id) on delete restrict;
update private.ticket_checkins c set participation_id=p.participation_id from private.ticket_passes p where p.id=c.pass_id;
alter table private.ticket_checkins add constraint qr_one_primary_per_participation unique(participation_id);
alter table private.qr_admission_config enable row level security;
alter table private.qr_command_receipts enable row level security;
alter table private.qr_token_history enable row level security;
alter table private.qr_scan_limits enable row level security;
alter table private.event_private_details enable row level security;
revoke all on private.qr_admission_config,private.qr_command_receipts,private.qr_token_history,private.qr_scan_limits,private.event_private_details from PUBLIC,anon,authenticated,service_role;

create function private.qr_require_actor() returns uuid
language plpgsql volatile security definer set search_path='' as $$
declare u uuid:=auth.uid(); sid uuid;
begin
 if u is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'forbidden' using errcode='42501'; end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 perform 1 from auth.sessions s where s.id=sid and s.user_id=u and (s.not_after is null or s.not_after>clock_timestamp()) for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from private.member_admission a where a.user_id=u and a.state in ('admitted','exempt') for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from private.qr_admission_config where singleton and enabled and synthetic_admission and project_ref='xrocuwlofxhxoxajukne') then raise exception 'not_configured' using errcode='55000'; end if;
 return u;
end $$;

-- JWT aal2 may outlive a factor deletion/session downgrade. Require current server state too.
create function private.qr_require_mfa() returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 if coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id and f.user_id=s.user_id
 where s.id=nullif(auth.jwt()->>'session_id','')::uuid and s.user_id=auth.uid() and s.aal='aal2'
 and (s.not_after is null or s.not_after>clock_timestamp()) and f.status='verified' for share of s,f;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
end $$;

create function private.qr_require_staff(_event uuid,_manage boolean default false) returns void
language plpgsql volatile security definer set search_path='' as $$
begin
 perform private.qr_require_mfa();
 perform 1 from public.staff_assignments a where a.user_id=auth.uid() and a.revoked_at is null
 and a.valid_from<=clock_timestamp() and (a.valid_until is null or a.valid_until>clock_timestamp())
 and (a.event_id is null or a.event_id=_event)
 and (a.role in ('owner','admin') or (not _manage and a.role in ('scanner','shift_lead'))) for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
end $$;

create function private.qr_hash(_text text) returns text
language sql immutable strict set search_path='' as $$ select encode(sha256(convert_to(_text,'UTF8')),'hex') $$;

create function private.qr_outcome(_participation uuid) returns text
language plpgsql volatile security definer set search_path='' as $$
declare a public.participations; o public.orders; e public.events;
begin
 select * into a from public.participations where id=_participation;
 if a.id is null then return 'not_found'; end if;
 select * into o from public.orders where id=a.order_id;
 select * into e from public.events where id=a.event_id;
 if not e.is_synthetic or o.environment<>'sandbox' then return 'test_only'; end if;
 if e.status<>'published' or e.cancelled_at is not null then return 'event_unavailable'; end if;
 if a.status<>'active' or o.status<>'paid' or a.event_id<>o.event_id or a.user_id<>o.user_id then return 'participation_inactive'; end if;
 if not exists(select 1 from public.reservations r join public.applications app on app.id=r.application_id
 where r.id=o.reservation_id and r.event_id=a.event_id and r.user_id=a.user_id and app.event_id=a.event_id and app.user_id=a.user_id and app.status='approved') then return 'approval_required'; end if;
 perform 1 from private.member_admission m where m.user_id=a.user_id and m.state in ('admitted','exempt') for share;
 if not found then return 'member_revoked'; end if;
 if e.qr_release_at is null or e.address_reveal_at is null or e.entry_opens_at is null or e.entry_closes_at is null then return 'window_required'; end if;
 if clock_timestamp()>=e.entry_closes_at then return 'expired'; end if;
 return 'eligible';
end $$;

create function private.qr_pass_dto(_participation uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare a public.participations; e public.events; p private.ticket_passes; outcome text;
begin
 select * into a from public.participations where id=_participation;
 if a.id is null then return null; end if;
 select * into e from public.events where id=a.event_id;
 select * into p from private.ticket_passes where participation_id=a.id;
 outcome:=private.qr_outcome(a.id);
 if exists(select 1 from private.ticket_checkins where participation_id=a.id) then outcome:='used';
 elsif outcome='eligible' and p.id is not null and p.token_key_version<>'explicit-v2' then outcome:='legacy_disabled';
 elsif outcome='eligible' and p.id is not null and p.status<>'active' then outcome:=p.status;
 elsif outcome='eligible' and p.id is not null and p.valid_until<=clock_timestamp() then outcome:='expired';
 elsif outcome='eligible' and clock_timestamp()<e.qr_release_at then outcome:='before_release';
 elsif outcome='eligible' then outcome:=case when p.id is null then 'not_issued' else 'active' end; end if;
 return jsonb_build_object('participationId',a.id,'eventId',e.id,'eventTitle',e.title,'timezone',e.timezone,
 'qrReleaseAt',e.qr_release_at,'addressRevealAt',e.address_reveal_at,'entryOpensAt',e.entry_opens_at,'entryClosesAt',e.entry_closes_at,
 'passId',p.id,'version',coalesce(p.version,0),'generation',coalesce(p.generation,0),'status',outcome,
 'secretContract','explicit-rotation-v2','secretUnavailable',p.id is not null,'simulated',true,'reentryAllowed',false);
end $$;

create function private.qr_command(_command jsonb) returns jsonb
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
  select coalesce(jsonb_agg(private.qr_pass_dto(a.id) order by e.starts_at),'[]'::jsonb) into result
  from public.participations a join public.events e on e.id=a.event_id where a.user_id=u and e.is_synthetic;
  return jsonb_build_object('items',result,'secretContract','explicit-rotation-v2');
 elsif action='catalog' then
  perform private.qr_require_mfa();
  select coalesce(jsonb_agg(jsonb_build_object('eventId',e.id,'eventTitle',e.title,'timezone',e.timezone) order by e.starts_at),'[]'::jsonb) into result
  from public.events e where e.is_synthetic and exists(select 1 from public.staff_assignments s where s.user_id=u and s.revoked_at is null
  and s.valid_from<=clock_timestamp() and (s.valid_until is null or s.valid_until>clock_timestamp())
  and (s.event_id is null or s.event_id=e.id) and s.role in ('owner','admin','scanner','shift_lead'));
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
revoke all on function private.qr_require_actor(),private.qr_require_mfa(),private.qr_require_staff(uuid,boolean),private.qr_hash(text),private.qr_outcome(uuid),private.qr_pass_dto(uuid),private.qr_command(jsonb) from PUBLIC,anon,authenticated,service_role;
commit;

