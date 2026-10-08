-- SEPARATE ACCESS EXPANSION PROPOSAL. DO NOT APPLY WITHOUT EXACT ACTION-TIME APPROVAL.
-- Only these five public RPC signatures; private tables/schema and all other RPCs stay closed.
-- This grants no staff assignment. The private guard accepts only approved event-scoped
-- incident_operator / incident_manager profiles with finite expiry, live session, MFA and admission.
begin;
set local search_path='';
set local lock_timeout='3s';
do $$ declare expected record; owner_id oid;
begin
  select oid into owner_id from pg_roles where rolname=current_user;
  if current_user<>'postgres' then raise exception 'incident_wrapper_owner_mismatch'; end if;
  for expected in select unnest(array[
    'private.vne_incident_context()',
    'private.vne_incident_lookup(uuid,text,text)',
    'private.vne_incident_read(uuid,uuid,uuid)',
    'private.vne_incident_record(jsonb)',
    'private.vne_incident_append(jsonb)']) as signature loop
    if to_regprocedure(expected.signature) is null or owner_id is distinct from
      (select proowner from pg_proc where oid=to_regprocedure(expected.signature)) then
      raise exception 'incident_wrapper_owner_mismatch';
    end if;
  end loop;
end $$;

create function public.vne_incident_context() returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' then raise exception 'forbidden' using errcode='42501'; end if;
  return private.vne_incident_context();
end $$;
create function public.vne_incident_lookup(_event uuid,_mode text,_value text) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' then raise exception 'forbidden' using errcode='42501'; end if;
  return private.vne_incident_lookup(_event,_mode,_value);
end $$;
create function public.vne_incident_read(_event uuid,_user uuid,_incident uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' then raise exception 'forbidden' using errcode='42501'; end if;
  return private.vne_incident_read(_event,_user,_incident);
end $$;
create function public.vne_incident_record(_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' then raise exception 'forbidden' using errcode='42501'; end if;
  return private.vne_incident_record(_command);
end $$;
create function public.vne_incident_append(_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
  if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' then raise exception 'forbidden' using errcode='42501'; end if;
  return private.vne_incident_append(_command);
end $$;

revoke all on function public.vne_incident_context() from PUBLIC,anon,authenticated,service_role;
revoke all on function public.vne_incident_lookup(uuid,text,text) from PUBLIC,anon,authenticated,service_role;
revoke all on function public.vne_incident_read(uuid,uuid,uuid) from PUBLIC,anon,authenticated,service_role;
revoke all on function public.vne_incident_record(jsonb) from PUBLIC,anon,authenticated,service_role;
revoke all on function public.vne_incident_append(jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function public.vne_incident_context() to authenticated;
grant execute on function public.vne_incident_lookup(uuid,text,text) to authenticated;
grant execute on function public.vne_incident_read(uuid,uuid,uuid) to authenticated;
grant execute on function public.vne_incident_record(jsonb) to authenticated;
grant execute on function public.vne_incident_append(jsonb) to authenticated;
commit;
