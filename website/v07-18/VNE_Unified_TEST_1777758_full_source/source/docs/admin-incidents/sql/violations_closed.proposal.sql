-- LOCAL REVIEW CANDIDATE ONLY. NEVER EXECUTED. NO LIVE APPLY AUTHORIZATION.
-- Intended base: xrocuwlofxhxoxajukne restricted baseline + ID trace + R2.
-- No public RPC, GRANT, staff assignment, secret, delivery or entry/redemption change.
-- Applying later requires reviewed exact target/DDL and separate access approval.
begin;
set local search_path = '';
set local lock_timeout = '3s';

do $preflight$
begin
  if current_user <> 'postgres'
    or pg_catalog.to_regprocedure('private.staff_can(text,uuid)') is null
    or pg_catalog.to_regprocedure('private.vne_incident_session_ok()') is null
    or pg_catalog.to_regprocedure('private.has_role(public.staff_role[],uuid)') is null
    or pg_catalog.to_regprocedure('private.r2_utf16_length(text)') is null then
    raise exception 'incident_baseline_not_verified';
  end if;
  if pg_catalog.to_regclass('private.vne_incidents') is not null then
    raise exception 'incident_schema_already_exists_review_drift';
  end if;
end $preflight$;

create table private.vne_incidents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  incident_type text not null check (incident_type in (
    'camera','access_sharing','location_disclosure','prohibited_items','disrespect_safety','other')),
  original_reason text not null check (char_length(original_reason) between 3 and 1000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  correlation_id uuid not null default gen_random_uuid()
);
create index vne_incidents_event_user_time on private.vne_incidents(event_id,user_id,created_at desc,id);

create table private.vne_incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references private.vne_incidents(id) on delete restrict,
  sequence integer not null check (sequence > 0),
  kind text not null check (kind in ('decision','correction','appeal','appeal_resolution','account_note','restriction_request','restriction_approved','restriction_rejected','appeal_upheld')),
  reason text not null check (char_length(reason) between 3 and 1000),
  decision text check (decision in (
    'warning','require_correction','remove_event','restrict_temporary','refer_organizer','close_no_action')),
  restriction_until timestamptz,
  requested_days integer check (requested_days between 1 and 90),
  replacement_type text check (replacement_type in (
    'camera','access_sharing','location_disclosure','prohibited_items','disrespect_safety','other')),
  reference_event_id uuid references private.vne_incident_events(id) on delete restrict,
  actor_id uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  operation_id uuid not null,
  correlation_id uuid not null,
  unique(incident_id,sequence),
  unique(actor_id,operation_id),
  check (
    (kind in ('decision','appeal_resolution','restriction_approved') and decision is not null and replacement_type is null)
    or (kind in ('correction','appeal','account_note','restriction_request','restriction_rejected','appeal_upheld') and decision is null and restriction_until is null)
  ),
  check (replacement_type is null or kind='correction'),
  check ((kind='restriction_request' and requested_days is not null) or (kind<>'restriction_request' and requested_days is null)),
  check (kind<>'restriction_approved' or decision='restrict_temporary'),
  check (
    (decision='restrict_temporary' and restriction_until is not null and restriction_until>recorded_at
      and restriction_until<=recorded_at+interval '90 days')
    or (decision is distinct from 'restrict_temporary' and restriction_until is null)
  ),
  check ((kind in ('appeal','appeal_resolution','restriction_approved','restriction_rejected','appeal_upheld') and reference_event_id is not null)
    or (kind not in ('appeal','appeal_resolution','restriction_approved','restriction_rejected','appeal_upheld') and reference_event_id is null))
);
create index vne_incident_events_case_sequence on private.vne_incident_events(incident_id,sequence desc);

create table private.vne_incident_operations (
  actor_id uuid not null references auth.users(id) on delete restrict,
  operation_id uuid not null,
  fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
  incident_id uuid not null references private.vne_incidents(id) on delete restrict,
  ledger_event_id uuid not null references private.vne_incident_events(id) on delete restrict,
  recorded_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,operation_id)
);

alter table private.vne_incidents enable row level security;
alter table private.vne_incident_events enable row level security;
alter table private.vne_incident_operations enable row level security;
revoke all on private.vne_incidents,private.vne_incident_events,private.vne_incident_operations
  from PUBLIC,anon,authenticated,service_role;

create function private.vne_incident_immutable() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'incident_history_is_append_only' using errcode='42501';
end $$;
create trigger vne_incidents_immutable before update or delete on private.vne_incidents
  for each row execute function private.vne_incident_immutable();
create trigger vne_incident_events_immutable before update or delete on private.vne_incident_events
  for each row execute function private.vne_incident_immutable();
create trigger vne_incident_operations_immutable before update or delete on private.vne_incident_operations
  for each row execute function private.vne_incident_immutable();

-- Plain text only; clients render text nodes, never HTML. No QR payload belongs here.
create function private.vne_incident_reason(_value jsonb) returns text
language plpgsql immutable set search_path='' as $$
declare v text;
begin
  if pg_catalog.jsonb_typeof(_value) is distinct from 'string' then
    raise exception 'reason_required' using errcode='22023';
  end if;
  v:=private.r2_js_trim(_value#>>'{}');
  if private.r2_utf16_length(replace(private.r2_js_normalize(v),' ',''))<3 or private.r2_utf16_length(v)>1000
    or v ~ U&'[\0001-\0008\000B\000C\000E-\001F\007F-\009F\202A-\202E\2066-\2069]' then
    raise exception 'reason_invalid' using errcode='22023';
  end if;
  return v;
end $$;

-- Proposed narrow profile names are compared as text, so this closed code installs
-- without adding enum values or assigning any role. Separate access proposal owns those steps.
create function private.vne_incident_can(_action text,_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and auth.jwt()->>'role' = 'authenticated'
    and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) = false
    and private.vne_incident_session_ok()
    and _event is not null
    and exists(select 1 from public.staff_assignments s
      where s.user_id=auth.uid() and (s.event_id=_event or (s.event_id is null and s.role::text='incident_manager')) and s.revoked_at is null
        and s.valid_from<=now() and (s.valid_until>now() or (s.valid_until is null and s.event_id is null and s.role::text='incident_manager'))
        and case _action
          when 'record' then s.role::text in ('incident_operator','incident_manager')
          when 'organizer' then s.role::text='incident_manager'
          else false end);
$$;

create function private.vne_incident_assert_decision(_decision text,_days jsonb,_event uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare n numeric;
begin
  if _decision is null or _decision not in (
    'warning','require_correction','remove_event','restrict_temporary','request_restriction','refer_organizer','close_no_action') then
    raise exception 'decision_invalid' using errcode='22023';
  end if;
  if not private.vne_incident_can('record',_event) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if _decision in ('restrict_temporary','request_restriction') then
    if _decision='restrict_temporary' and not private.vne_incident_can('organizer',_event) then
      raise exception 'manager_review_required' using errcode='42501';
    end if;
    if pg_catalog.jsonb_typeof(_days) is distinct from 'number' then
      raise exception 'duration_required' using errcode='22023';
    end if;
    n:=(_days#>>'{}')::numeric;
    if n<1 or n>90 or n<>pg_catalog.trunc(n) then
      raise exception 'duration_invalid' using errcode='22023';
    end if;
    return n::integer;
  end if;
  if _days is distinct from 'null'::jsonb then
    raise exception 'unexpected_duration' using errcode='22023';
  end if;
  return null;
end $$;

create function private.vne_incident_record(_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); eid uuid; uid uuid; opid uuid; bodyhash text;
  typename text; reason_text text; decision_text text; days integer;
  caseid uuid; ledgerid uuid; corr uuid:=gen_random_uuid(); at_time timestamptz;
  previous private.vne_incident_operations;
begin
  if actor is null or not private.vne_incident_session_ok() then raise exception 'forbidden' using errcode='42501'; end if;
  if not private.r2_exact_keys(_command,array['eventId','userId','operationId','confirmedTarget','type','reason','decision','restrictionDays'])
    or pg_catalog.octet_length(_command::text)>16384
    or _command->'confirmedTarget' is distinct from 'true'::jsonb then
    raise exception 'invalid_command' using errcode='22023';
  end if;
  eid:=(_command->>'eventId')::uuid; uid:=(_command->>'userId')::uuid; opid:=(_command->>'operationId')::uuid;
  typename:=_command->>'type'; reason_text:=private.vne_incident_reason(_command->'reason');
  decision_text:=_command->>'decision';
  if eid is null or uid is null or opid is null or typename is null or typename not in (
    'camera','access_sharing','location_disclosure','prohibited_items','disrespect_safety','other') then
    raise exception 'invalid_command' using errcode='22023';
  end if;
  if decision_text='restrict_temporary' then raise exception 'restriction_request_required' using errcode='22023'; end if;
  days:=private.vne_incident_assert_decision(decision_text,_command->'restrictionDays',eid);
  -- Exact event/account association; names, possession of a QR and user_metadata do not establish it.
  if not exists(select 1 from public.applications a where a.event_id=eid and a.user_id=uid)
    and not exists(select 1 from private.ticket_passes p where p.event_id=eid and p.user_id=uid) then
    raise exception 'target_not_linked_to_event' using errcode='22023';
  end if;
  bodyhash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(_command::text,'UTF8')),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||opid::text,0));
  select * into previous from private.vne_incident_operations where actor_id=actor and operation_id=opid;
  if found then
    if previous.fingerprint<>bodyhash then raise exception 'idempotency_conflict' using errcode='22023'; end if;
    return jsonb_build_object('incidentId',previous.incident_id,'ledgerEventId',previous.ledger_event_id,'replayed',true);
  end if;
  days:=private.vne_incident_assert_decision(decision_text,_command->'restrictionDays',eid);
  at_time:=clock_timestamp();
  insert into private.vne_incidents(event_id,user_id,incident_type,original_reason,created_by,created_at,correlation_id)
    values(eid,uid,typename,reason_text,actor,at_time,corr) returning id into caseid;
  insert into private.vne_incident_events(incident_id,sequence,kind,reason,decision,restriction_until,requested_days,actor_id,recorded_at,operation_id,correlation_id)
    values(caseid,1,case when decision_text='request_restriction' then 'restriction_request' else 'decision' end,reason_text,
      case when decision_text='request_restriction' then null else decision_text end,null,
      case when decision_text='request_restriction' then days else null end,actor,at_time,opid,corr)
    returning id into ledgerid;
  insert into private.vne_incident_operations(actor_id,operation_id,fingerprint,incident_id,ledger_event_id)
    values(actor,opid,bodyhash,caseid,ledgerid);
  insert into private.audit_log(actor,action,object_type,object_id,result,correlation_id,details)
    values(actor,'incident.record','incident',caseid,'ok',corr,
      jsonb_build_object('event_id',eid,'operation_id',opid,'decision',decision_text));
  -- An audit insert failure rolls back the entire record. No reason/contact/token in audit.
  return jsonb_build_object('incidentId',caseid,'ledgerEventId',ledgerid,'version',1,'replayed',false,'correlationId',corr);
end $$;

create function private.vne_incident_append(_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid(); caseid uuid; opid uuid; refid uuid; expected integer; current_version integer;
  kindtext text; reason_text text; decision_text text; replacement text; days integer;
  bodyhash text; ledgerid uuid; corr uuid:=gen_random_uuid(); at_time timestamptz; first_restriction_at timestamptz;
  subject private.vne_incidents; previous private.vne_incident_operations; referenced private.vne_incident_events;
begin
  if actor is null or not private.vne_incident_session_ok() then raise exception 'forbidden' using errcode='42501'; end if;
  if not private.r2_exact_keys(_command,array['incidentId','operationId','expectedVersion','kind','reason','decision','restrictionDays','referenceEventId','replacementType'])
    or pg_catalog.octet_length(_command::text)>16384 then
    raise exception 'invalid_command' using errcode='22023';
  end if;
  caseid:=(_command->>'incidentId')::uuid; opid:=(_command->>'operationId')::uuid;
  if pg_catalog.jsonb_typeof(_command->'expectedVersion') is distinct from 'number'
    or (_command->>'expectedVersion')::numeric<>pg_catalog.trunc((_command->>'expectedVersion')::numeric) then
    raise exception 'invalid_version' using errcode='22023';
  end if;
  expected:=(_command->>'expectedVersion')::integer;
  kindtext:=_command->>'kind'; reason_text:=private.vne_incident_reason(_command->'reason');
  decision_text:=_command->>'decision'; replacement:=_command->>'replacementType';
  refid:=(_command->>'referenceEventId')::uuid;
  if caseid is null or opid is null or expected<1 or kindtext is null
    or kindtext not in ('decision','correction','appeal','appeal_resolution','account_note','restriction_request','restriction_approved','restriction_rejected','appeal_upheld') then
    raise exception 'invalid_command' using errcode='22023';
  end if;
  select * into subject from private.vne_incidents where id=caseid;
  if not found or not private.vne_incident_can('record',subject.event_id) then raise exception 'forbidden' using errcode='42501'; end if;
  if kindtext in ('decision','appeal_resolution','restriction_request','restriction_approved') then
    if kindtext='restriction_request' and decision_text is distinct from 'request_restriction' then raise exception 'invalid_restriction_request' using errcode='22023'; end if;
    if kindtext='restriction_approved' and decision_text is distinct from 'restrict_temporary' then raise exception 'invalid_restriction_approval' using errcode='22023'; end if;
    if kindtext in ('decision','appeal_resolution') and decision_text in ('restrict_temporary','request_restriction') then raise exception 'restriction_request_required' using errcode='22023'; end if;
    days:=private.vne_incident_assert_decision(decision_text,_command->'restrictionDays',subject.event_id);
  elsif decision_text is not null or _command->'restrictionDays' is distinct from 'null'::jsonb then
    raise exception 'unexpected_decision' using errcode='22023';
  end if;
  if kindtext in ('decision','appeal_resolution','restriction_approved','restriction_rejected','appeal_upheld') and not private.vne_incident_can('organizer',subject.event_id) then
    raise exception 'manager_review_required' using errcode='42501';
  end if;
  if replacement is not null and (kindtext<>'correction' or replacement not in (
    'camera','access_sharing','location_disclosure','prohibited_items','disrespect_safety','other')) then
    raise exception 'invalid_correction' using errcode='22023';
  end if;
  bodyhash:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(_command::text,'UTF8')),'hex');
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor::text||opid::text,0));
  select * into previous from private.vne_incident_operations where actor_id=actor and operation_id=opid;
  if found then
    if previous.fingerprint<>bodyhash then raise exception 'idempotency_conflict' using errcode='22023'; end if;
    return jsonb_build_object('incidentId',previous.incident_id,'ledgerEventId',previous.ledger_event_id,'replayed',true);
  end if;
  perform 1 from private.vne_incidents where id=caseid for update;
  if not private.vne_incident_can('record',subject.event_id) then raise exception 'forbidden' using errcode='42501'; end if;
  select coalesce(max(sequence),0) into current_version from private.vne_incident_events where incident_id=caseid;
  if expected<>current_version then raise exception 'version_conflict' using errcode='40001'; end if;
  if kindtext in ('appeal','appeal_resolution','restriction_approved','restriction_rejected','appeal_upheld') then
    select * into referenced from private.vne_incident_events where id=refid and incident_id=caseid;
    if not found or (kindtext='appeal' and referenced.kind not in ('decision','appeal_resolution','restriction_approved'))
      or (kindtext in ('appeal_resolution','appeal_upheld') and referenced.kind<>'appeal')
      or (kindtext in ('restriction_approved','restriction_rejected') and referenced.kind<>'restriction_request') then
      raise exception 'invalid_reference' using errcode='22023';
    end if;
    if kindtext in ('restriction_approved','restriction_rejected') and exists(select 1 from private.vne_incident_events e
      where e.incident_id=caseid and e.kind in ('restriction_approved','restriction_rejected') and e.reference_event_id=refid) then
      raise exception 'restriction_already_reviewed' using errcode='22023';
    end if;
    if kindtext='restriction_approved' and days>referenced.requested_days then
      raise exception 'restriction_exceeds_request' using errcode='22023';
    end if;
    if kindtext in ('appeal_resolution','appeal_upheld') and exists(select 1 from private.vne_incident_events e
      where e.incident_id=caseid and e.kind in ('appeal_resolution','appeal_upheld') and e.reference_event_id=refid) then
      raise exception 'appeal_already_resolved' using errcode='22023';
    end if;
  elsif refid is not null then raise exception 'unexpected_reference' using errcode='22023'; end if;
  if kindtext in ('decision','appeal_resolution','restriction_request','restriction_approved') then
    if kindtext='restriction_request' and decision_text is distinct from 'request_restriction' then raise exception 'invalid_restriction_request' using errcode='22023'; end if;
    if kindtext='restriction_approved' and decision_text is distinct from 'restrict_temporary' then raise exception 'invalid_restriction_approval' using errcode='22023'; end if;
    if kindtext in ('decision','appeal_resolution') and decision_text in ('restrict_temporary','request_restriction') then raise exception 'restriction_request_required' using errcode='22023'; end if;
    days:=private.vne_incident_assert_decision(decision_text,_command->'restrictionDays',subject.event_id);
  end if;
  if kindtext in ('decision','appeal_resolution','restriction_approved','restriction_rejected','appeal_upheld') and not private.vne_incident_can('organizer',subject.event_id) then
    raise exception 'manager_review_required' using errcode='42501';
  end if;
  at_time:=clock_timestamp();
  if kindtext='restriction_approved' and days is not null then
    select min(recorded_at) into first_restriction_at from private.vne_incident_events
      where incident_id=caseid and decision='restrict_temporary';
    if at_time+days*interval '1 day' > coalesce(first_restriction_at,at_time)+interval '90 days' then
      raise exception 'incident_restriction_cannot_be_rolled_forward' using errcode='22023';
    end if;
  end if;
  if kindtext='restriction_request' and exists(select 1 from private.vne_incident_events r where r.incident_id=caseid and r.kind='restriction_request'
    and not exists(select 1 from private.vne_incident_events z where z.incident_id=caseid and z.kind in ('restriction_approved','restriction_rejected') and z.reference_event_id=r.id)) then
    raise exception 'restriction_request_already_pending' using errcode='22023';
  end if;
  insert into private.vne_incident_events(incident_id,sequence,kind,reason,decision,restriction_until,requested_days,replacement_type,reference_event_id,actor_id,recorded_at,operation_id,correlation_id)
    values(caseid,current_version+1,kindtext,reason_text,case when kindtext='restriction_request' then null else decision_text end,
      case when kindtext='restriction_approved' then at_time+days*interval '1 day' else null end,
      case when kindtext='restriction_request' then days else null end,replacement,refid,actor,at_time,opid,corr)
    returning id into ledgerid;
  insert into private.vne_incident_operations(actor_id,operation_id,fingerprint,incident_id,ledger_event_id)
    values(actor,opid,bodyhash,caseid,ledgerid);
  insert into private.audit_log(actor,action,object_type,object_id,result,correlation_id,details)
    values(actor,'incident.'||kindtext,'incident',caseid,'ok',corr,
      jsonb_build_object('event_id',subject.event_id,'operation_id',opid,'version',current_version+1));
  return jsonb_build_object('incidentId',caseid,'ledgerEventId',ledgerid,'version',current_version+1,'replayed',false,'correlationId',corr);
end $$;

-- Metadata-only projection. Does not wire restrictions into login, ticketing or admission.
create view private.vne_incident_current with(security_invoker=true,security_barrier=true) as
select c.id,c.event_id,c.user_id,c.created_at,
  coalesce(f.replacement_type,c.incident_type) as incident_type,
  d.decision,d.restriction_until,d.id as decision_event_id,
  exists(select 1 from private.vne_incident_events r where r.incident_id=c.id and r.kind='restriction_request'
    and not exists(select 1 from private.vne_incident_events z where z.incident_id=c.id and z.kind in ('restriction_approved','restriction_rejected') and z.reference_event_id=r.id)) as restriction_request_pending,
  (select max(e.sequence) from private.vne_incident_events e where e.incident_id=c.id) as version,
  exists(select 1 from private.vne_incident_events a where a.incident_id=c.id and a.kind='appeal'
    and not exists(select 1 from private.vne_incident_events r where r.incident_id=c.id and r.kind in ('appeal_resolution','appeal_upheld') and r.reference_event_id=a.id)) as has_open_appeal
from private.vne_incidents c
left join lateral(select e.id,e.decision,e.restriction_until from private.vne_incident_events e
  where e.incident_id=c.id and e.kind in ('decision','appeal_resolution','restriction_approved')
  order by e.sequence desc limit 1) d on true
left join lateral(select e.replacement_type from private.vne_incident_events e
  where e.incident_id=c.id and e.kind='correction' and e.replacement_type is not null
  order by e.sequence desc limit 1) f on true;
revoke all on private.vne_incident_current from PUBLIC,anon,authenticated,service_role;
revoke all on function private.vne_incident_immutable() from PUBLIC,anon,authenticated,service_role;
revoke all on function private.vne_incident_reason(jsonb) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.vne_incident_can(text,uuid) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.vne_incident_assert_decision(text,jsonb,uuid) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.vne_incident_record(jsonb) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.vne_incident_append(jsonb) from PUBLIC,anon,authenticated,service_role;
commit;
