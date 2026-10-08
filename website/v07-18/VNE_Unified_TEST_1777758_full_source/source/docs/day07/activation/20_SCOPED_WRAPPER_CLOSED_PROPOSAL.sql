-- LOCAL RECOVERY PROPOSAL ONLY. No activation approval; do not execute remotely.
-- One public wrapper. Exact three identities/four event-participation pairs and one 20-minute window.
begin;
set local search_path='';set local lock_timeout='3s';
do $guard$ begin
 if nullif(current_setting('vne.day07.approval_ref',true),'') is null then raise exception 'explicit_approval_required';end if;
 if to_regprocedure('public.vne_qr_command(jsonb)') is not null then raise exception 'wrapper_exists_reconcile';end if;
 if not exists(select 1 from private.qr_admission_config where singleton and project_ref='xrocuwlofxhxoxajukne' and not enabled and not synthetic_admission) then raise exception 'closed_TEST_required';end if;
 if not exists(select 1 from pg_proc where oid='private.qr_command(jsonb)'::regprocedure and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='ad5e6d8a373ad9a93bcce234e3a7d640bd423717966c821837485357acc2f5bf') then raise exception 'exact_private_body_required';end if;
end $guard$;
create function public.vne_qr_command(_command jsonb) returns jsonb language plpgsql security definer set search_path='' set lock_timeout='3s' as $wrapper$
declare
 actor uuid:=auth.uid();event_ids uuid[]:=array['d0700000-0000-4000-8000-000000000001'::uuid,'d0710000-0000-4000-8000-000000000001'::uuid,'d0720000-0000-4000-8000-000000000001'::uuid,'d0730000-0000-4000-8000-000000000001'::uuid];part_ids uuid[]:=array['d0700000-0000-4000-8000-000000000006'::uuid,'d0710000-0000-4000-8000-000000000006'::uuid,'d0720000-0000-4000-8000-000000000006'::uuid,'d0730000-0000-4000-8000-000000000006'::uuid];
 start_at timestamptz;end_at timestamptz;action text;eid uuid;pid uuid;idx integer;r jsonb;x jsonb;filtered jsonb:='[]'::jsonb;
begin
 if actor is null or actor not in ('15cbc7a4-92f6-48d8-abb2-ed68f7612271'::uuid,'1e7259c2-ad13-43a1-b34b-cba71533e844'::uuid,'ed2433cb-bc6e-4b23-aa57-000839292ec4'::uuid) then raise exception 'forbidden' using errcode='42501';end if;
 if _command is null or jsonb_typeof(_command)<>'object' or octet_length(_command::text)>8192 then raise exception 'invalid_input' using errcode='22023';end if;
 select qr_release_at,entry_closes_at into start_at,end_at from public.events where id=event_ids[1] and is_synthetic and status='published' and cancelled_at is null;
 if start_at is null or end_at is null or end_at<>start_at+interval '20 minutes' or clock_timestamp()<start_at or clock_timestamp()>=end_at then raise exception 'outside_approved_window' using errcode='42501';end if;
 action:=_command->>'action';
 if action not in ('list','catalog') then
  eid:=(_command->>'eventId')::uuid;idx:=array_position(event_ids,eid);
  if idx is null then raise exception 'forbidden' using errcode='42501';end if;
  if action in ('status','address','issue','rotate','revoke') and (_command->>'participationId')::uuid is distinct from part_ids[idx] then raise exception 'forbidden' using errcode='42501';end if;
 end if;
 r:=private.qr_command(_command);
 -- Recheck the absolute window after any private lock wait; exception rolls back every inner effect.
 if clock_timestamp()<start_at or clock_timestamp()>=end_at then raise exception 'outside_approved_window' using errcode='42501';end if;
 if action='list' then
  for x in select value from jsonb_array_elements(r->'items') loop
   idx:=array_position(event_ids,(x->>'eventId')::uuid);
   if idx is not null and (x->>'participationId')::uuid=part_ids[idx] then filtered:=filtered||jsonb_build_array(x);end if;
  end loop;
  return jsonb_set(r,'{items}',filtered);
 elsif action='catalog' then
  for x in select value from jsonb_array_elements(r->'events') loop
   if (x->>'eventId')::uuid=any(event_ids) then filtered:=filtered||jsonb_build_array(x);end if;
  end loop;
  return jsonb_set(r,'{events}',filtered);
 elsif action in ('verify','checkin') then
  if r->'receipt'->>'eventId' is distinct from eid::text then raise exception 'fixture_binding_conflict' using errcode='42501';end if;
  pid:=(r->'receipt'->>'participationId')::uuid;
  if (pid is null and coalesce(r->'receipt'->>'outcome','') not in ('invalid_token','not_found','rate_limited','replaced')) or (pid is not null and pid is distinct from part_ids[idx]) then raise exception 'fixture_binding_conflict' using errcode='42501';end if;
 end if;
 return r;
end $wrapper$;
revoke all on function public.vne_qr_command(jsonb) from PUBLIC,anon,authenticated,service_role;
commit;
