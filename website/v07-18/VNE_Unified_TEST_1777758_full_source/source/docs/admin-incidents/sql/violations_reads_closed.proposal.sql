-- CLOSED LOCAL CANDIDATE. No API grants, aliases, staff assignments or live apply.
begin;
set local search_path='';
set local lock_timeout='3s';
do $$ begin
  if current_user<>'postgres' or to_regprocedure('private.vne_incident_can(text,uuid)') is null then
    raise exception 'incident_read_baseline_missing';
  end if;
end $$;

create function private.vne_incident_context() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated'
    or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or not private.vne_incident_session_ok() then
    raise exception 'forbidden' using errcode='42501';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,
    'canRecord',true,'canRestrict',private.vne_incident_can('organizer',e.id)) order by e.id),'[]'::jsonb)
    into result from public.events e where private.vne_incident_can('record',e.id);
  return jsonb_build_object('events',result);
end $$;

create function private.vne_incident_lookup(_event uuid,_mode text,_value text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; uid uuid; scan_hash text; matched_pass record;
begin
  if not private.vne_incident_can('record',_event) then raise exception 'forbidden' using errcode='42501'; end if;
  if _mode not in ('id','name','qr') or _mode is null or _value is null or private.r2_utf16_length(_value)>128 then
    raise exception 'invalid_lookup' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text||':incident_lookup',0));
  if (select count(*) from private.audit_log where actor=auth.uid() and action='incident.lookup'
    and at>clock_timestamp()-interval '1 minute')>=30 then
    raise exception 'lookup_rate_limited' using errcode='P0001';
  end if;
  if _mode='qr' then
    if _value !~ '^VNE1:[A-Za-z0-9_-]{43}$' then raise exception 'invalid_qr' using errcode='22023'; end if;
    scan_hash:=encode(sha256(convert_to(substr(_value,6),'UTF8')),'hex');
    select p.id,p.user_id into matched_pass from private.ticket_passes p where p.event_id=_event and p.scan_token_hash=scan_hash;
    if matched_pass.id is not null and matched_pass.user_id is null then
      result:=jsonb_build_object('outcome','unlinked_account','candidates','[]'::jsonb);
    end if;
    uid:=matched_pass.user_id;
  elsif _mode='id' then
    if _value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'invalid_id' using errcode='22023';
    end if;
    uid:=_value::uuid;
  elsif char_length(btrim(_value))<2 or private.r2_utf16_length(_value)>80 then
    raise exception 'invalid_name_query' using errcode='22023';
  end if;
  if result is null then
    select jsonb_build_object('outcome','confirm_exact_person','candidates',
      coalesce(jsonb_agg(jsonb_build_object('userId',x.id,'displayName',x.display_name) order by x.id),'[]'::jsonb))
      into result from (
        select u.id,coalesce(nullif(p.display_name,''),'Участник') as display_name
        from auth.users u left join public.profiles p on p.id=u.id
        where ((_mode in ('id','qr') and u.id=uid) or (_mode='name' and position(lower(btrim(_value)) in lower(coalesce(p.display_name,'')))>0))
          and (exists(select 1 from public.applications a where a.event_id=_event and a.user_id=u.id)
            or exists(select 1 from private.ticket_passes t where t.event_id=_event and t.user_id=u.id))
        order by u.id limit 20
      ) x;
  end if;
  -- Metadata only. Never persist the input value, token, token hash, name or contact.
  insert into private.audit_log(actor,action,object_type,object_id,result,details)
    values(auth.uid(),'incident.lookup','event',_event,'ok',jsonb_build_object('mode',_mode));
  return result;
end $$;

create function private.vne_incident_read(_event uuid,_user uuid,_incident uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; subject private.vne_incidents; events jsonb;
begin
  if not private.vne_incident_can('record',_event) then raise exception 'forbidden' using errcode='42501'; end if;
  if _user is null then raise exception 'invalid_target' using errcode='22023'; end if;
  if _incident is null then
    select jsonb_build_object(
      'eventId',_event,'userId',_user,
      'totalRecords',count(*),
      'recordsWithMeasures',count(*) filter(where decision not in ('refer_organizer','close_no_action')),
      'pendingReview',count(*) filter(where decision='refer_organizer' or restriction_request_pending),
      'activeRestrictions',count(*) filter(where decision='restrict_temporary' and restriction_until>clock_timestamp()),
      'items',coalesce(jsonb_agg(jsonb_build_object('id',id,'type',incident_type,'createdAt',created_at,
        'decision',decision,'restrictionUntil',restriction_until,'version',version,'hasOpenAppeal',has_open_appeal,'restrictionRequestPending',restriction_request_pending)
        order by created_at desc,id desc),'[]'::jsonb)) into result
    from (select * from private.vne_incident_current where event_id=_event and user_id=_user
      order by created_at desc,id desc limit 101)c;
    -- Explicit cap: client must not interpret a truncated result as complete historical totals.
    result:=result||jsonb_build_object('limited',jsonb_array_length(result->'items')=101,'scope','selected_event');
    result:=result||(select jsonb_build_object('totalRecords',count(*),
      'recordsWithMeasures',count(*) filter(where decision not in ('refer_organizer','close_no_action')),
      'pendingReview',count(*) filter(where decision='refer_organizer' or restriction_request_pending),
      'activeRestrictions',count(*) filter(where decision='restrict_temporary' and restriction_until>clock_timestamp()))
      from private.vne_incident_current where event_id=_event and user_id=_user);
  else
    select * into subject from private.vne_incidents where id=_incident and event_id=_event and user_id=_user;
    if not found then return jsonb_build_object('item',null); end if;
    select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'sequence',e.sequence,'kind',e.kind,
      'reason',e.reason,'decision',e.decision,'restrictionUntil',e.restriction_until,'requestedDays',e.requested_days,
      'replacementType',e.replacement_type,'referenceEventId',e.reference_event_id,
      'actorId',e.actor_id,'recordedAt',e.recorded_at) order by e.sequence),'[]'::jsonb)
      into events from (select * from private.vne_incident_events where incident_id=_incident order by sequence desc limit 201)e;
    result:=jsonb_build_object('item',jsonb_build_object('id',subject.id,'eventId',subject.event_id,
      'userId',subject.user_id,'originalType',subject.incident_type,'originalReason',subject.original_reason,
      'createdAt',subject.created_at,'createdBy',subject.created_by,'history',events,'limited',jsonb_array_length(events)=201));
    insert into private.audit_log(actor,action,object_type,object_id,result,details)
      values(auth.uid(),'incident.detail_read','incident',subject.id,'ok',jsonb_build_object('event_id',_event));
  end if;
  return result;
end $$;

revoke all on function private.vne_incident_context() from PUBLIC,anon,authenticated,service_role;
revoke all on function private.vne_incident_lookup(uuid,text,text) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.vne_incident_read(uuid,uuid,uuid) from PUBLIC,anon,authenticated,service_role;
commit;
