-- REVIEW-ONLY CLOSED DDL. Not an applied migration. No live SQL has been executed.
-- Base: the exact reviewed R2 TEST schema; no production/app-auth/settings/role grants.
-- A real migration filename must be generated through the Supabase CLI only after approval.
begin;
set local search_path = '';
set local lock_timeout = '3s';

do $$
declare owner_id oid;
begin
 select oid into owner_id from pg_catalog.pg_roles where rolname=current_user;
 if current_user in ('anon','authenticated','service_role','authenticator')
 or owner_id is distinct from (select relowner from pg_catalog.pg_class where oid='public.membership_requests'::regclass)
 or owner_id is distinct from (select proowner from pg_catalog.pg_proc where oid='private.membership_questionnaire_submit(jsonb)'::regprocedure)
 or owner_id is distinct from (select proowner from pg_catalog.pg_proc where oid='private.r2_membership_session_owner()'::regprocedure) then
  raise exception 'questionnaire_draft_owner_mismatch';
 end if;
end $$;

create function private.questionnaire_draft_text_valid(_value jsonb,_max integer) returns boolean
language sql immutable set search_path='' as $$
 select pg_catalog.jsonb_typeof(_value)='string'
  and private.r2_utf16_length(_value #>> '{}')<=_max
  and (_value #>> '{}') !~ '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]';
$$;
create function private.questionnaire_draft_payload_valid(_value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare q jsonb; a jsonb; d jsonb; v jsonb; n numeric; selected text[]; item text;
begin
 if _value is null or pg_catalog.octet_length(_value::text)>32768
 or not private.r2_exact_keys(_value,array['schemaVersion','questionnaireVersion','name','contact','telegram','event','resumeSection','questionnaire'])
 or _value->'schemaVersion' is distinct from '1'::jsonb or _value->'questionnaireVersion' is distinct from '3'::jsonb
 or not private.questionnaire_draft_text_valid(_value->'name',80)
 or not private.questionnaire_draft_text_valid(_value->'contact',254)
 or not private.questionnaire_draft_text_valid(_value->'telegram',256)
 or pg_catalog.jsonb_typeof(_value->'resumeSection') is distinct from 'string'
 or _value->>'resumeSection' not in ('questionnaire','contact','event') then return false; end if;
 if _value->'event' is distinct from 'null'::jsonb and
  (pg_catalog.jsonb_typeof(_value->'event') is distinct from 'string' or _value->>'event' !~ '^[a-z0-9-]{3,64}$') then return false; end if;
 q:=_value->'questionnaire';
 if not private.r2_exact_keys(q,array['mode','answers','ratings','age'])
 or pg_catalog.jsonb_typeof(q->'mode') is distinct from 'string'
 or q->>'mode' not in ('choices','manual')
 or not private.r2_exact_keys(q->'answers',array['interests','social_role','meeting_style','trust','boundaries','discomfort','motivation'])
 or not private.r2_exact_keys(q->'ratings',array['social_energy','evening_pace','spontaneity']) then return false; end if;
 for d in select value from pg_catalog.jsonb_array_elements(private.r2_questionnaire_definition()->'questions') loop
  a:=q->'answers'->(d->>'id');
  if not private.r2_exact_keys(a,array['selected','custom','useCustom','manual'])
  or pg_catalog.jsonb_typeof(a->'selected') is distinct from 'array'
  or pg_catalog.jsonb_typeof(a->'useCustom') is distinct from 'boolean'
  or not private.questionnaire_draft_text_valid(a->'custom',120) then return false; end if;
  if pg_catalog.jsonb_array_length(a->'selected')>3 then return false; end if;
  selected:=array[]::text[];
  for v in select value from pg_catalog.jsonb_array_elements(a->'selected') loop
   item:=v #>> '{}';
   if pg_catalog.jsonb_typeof(v) is distinct from 'string' or not (d->'options' ? item) or item=any(selected) then return false; end if;
   selected:=pg_catalog.array_append(selected,item);
  end loop;
  if a->'manual' is distinct from 'null'::jsonb then
   if pg_catalog.jsonb_typeof(a->'manual') is distinct from 'array' then return false; end if;
   if pg_catalog.jsonb_array_length(a->'manual')>3 then return false; end if;
   for v in select value from pg_catalog.jsonb_array_elements(a->'manual') loop
    if not private.questionnaire_draft_text_valid(v,120) then return false; end if;
   end loop;
  end if;
 end loop;
 for v in select value from pg_catalog.jsonb_each(q->'ratings') union all select q->'age' loop
  if v is distinct from 'null'::jsonb then
   if pg_catalog.jsonb_typeof(v) is distinct from 'number' then return false; end if;
   n:=(v #>> '{}')::numeric;
   if n<1 or n>100 or n<>pg_catalog.trunc(n) then return false; end if;
  end if;
 end loop;
 return true;
exception when others then return false;
end $$;

create table private.questionnaire_drafts (
 owner_user_id uuid not null references auth.users(id) on delete cascade,
 id uuid not null,
 is_current boolean not null default true,
 primary key(owner_user_id,id),
 version bigint not null check(version between 1 and 9007199254740991),
 payload jsonb not null check(private.questionnaire_draft_payload_valid(payload)),
 last_mutation_id uuid not null,
 saved_at timestamptz not null,
 expires_at timestamptz not null,
 constraint questionnaire_draft_ttl check(expires_at=saved_at+interval '1608 hours')
);
create unique index questionnaire_drafts_current_owner_idx on private.questionnaire_drafts(owner_user_id) where is_current;
create index questionnaire_drafts_expiry_idx on private.questionnaire_drafts(expires_at);
alter table private.questionnaire_drafts enable row level security;
-- Defense in depth. No API schema usage or table privilege is granted by either proposal.
create policy questionnaire_drafts_owner on private.questionnaire_drafts for all to authenticated
 using(owner_user_id=(select auth.uid()) and is_current and expires_at>pg_catalog.statement_timestamp())
 with check(owner_user_id=(select auth.uid()));

create function private.questionnaire_draft_record(_row private.questionnaire_drafts) returns jsonb
language sql stable strict set search_path='' as $$
 select pg_catalog.jsonb_build_object('id',_row.id,'version',_row.version,'payload',_row.payload,
  'savedAt',_row.saved_at,'expiresAt',_row.expires_at);
$$;
create function private.questionnaire_draft_read() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=private.r2_membership_session_owner(); d private.questionnaire_drafts; submitted boolean;
begin
 select exists(select 1 from public.membership_requests where owner_user_id=u and status='pending') into submitted;
 if not submitted then
  select * into d from private.questionnaire_drafts where owner_user_id=u and is_current and expires_at>pg_catalog.clock_timestamp();
 end if;
 -- A read never updates saved_at/expires_at. Expired data is inaccessible even before physical purge.
 return pg_catalog.jsonb_build_object('ownerUserId',u,'creationIssuedAt',pg_catalog.clock_timestamp(),'draft',case when d.id is null then null else private.questionnaire_draft_record(d) end,'submitted',submitted);
end $$;

create function private.questionnaire_draft_save(_command jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid:=private.r2_membership_session_owner(); d private.questionnaire_drafts;
 draft_id uuid; mutation uuid; expected bigint; at_time timestamptz;
begin
 if not private.r2_exact_keys(_command,array['expectedOwnerUserId','creationIssuedAt','id','expectedVersion','mutationId','payload'])
 or pg_catalog.octet_length(_command::text)>32768
 or pg_catalog.jsonb_typeof(_command->'creationIssuedAt') is distinct from 'string'
 or pg_catalog.char_length(_command->>'creationIssuedAt')>40
 or pg_catalog.jsonb_typeof(_command->'expectedOwnerUserId') is distinct from 'string'
 or pg_catalog.jsonb_typeof(_command->'id') is distinct from 'string'
 or pg_catalog.jsonb_typeof(_command->'mutationId') is distinct from 'string'
 or (_command->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or (_command->>'mutationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or pg_catalog.jsonb_typeof(_command->'expectedVersion') is distinct from 'number'
 or (_command->>'expectedVersion')::numeric<0 or (_command->>'expectedVersion')::numeric>=9007199254740991
 or (_command->>'expectedVersion')::numeric<>pg_catalog.trunc((_command->>'expectedVersion')::numeric)
 or not private.questionnaire_draft_payload_valid(_command->'payload') then raise exception 'invalid_draft' using errcode='22023'; end if;
 if _command->>'expectedOwnerUserId' is distinct from u::text then return pg_catalog.jsonb_build_object('ok',false,'reason','session_changed'); end if;
 draft_id:=(_command->>'id')::uuid; mutation:=(_command->>'mutationId')::uuid; expected:=(_command->>'expectedVersion')::bigint;
 -- Same owner mutex/order as R2 submission; covers save/save, save/submit and new-row races.
 perform 1 from auth.users where id=u for update;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=u
  and (not_after is null or not_after>pg_catalog.clock_timestamp()) for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 if exists(select 1 from public.membership_requests where owner_user_id=u and status='pending') then
  return pg_catalog.jsonb_build_object('ok',false,'reason','submitted');
 end if;
 at_time:=pg_catalog.clock_timestamp();
 select * into d from private.questionnaire_drafts where owner_user_id=u and is_current for update;
 if found then
  if d.expires_at<=at_time then
   if expected<>0 or d.id=draft_id then return pg_catalog.jsonb_build_object('ok',false,'reason','expired'); end if;
   -- Expired data remains inaccessible and retained pending a separately approved purge policy.
   -- Only an actual explicit new save can retire the current slot; reads never insert/update rows.
   update private.questionnaire_drafts set is_current=false where owner_user_id=u and id=d.id;
   d:=null;
  else
   if d.id=draft_id and d.last_mutation_id=mutation and d.version=expected+1 and d.payload=_command->'payload' then
    -- Retry after a lost response returns the original result and original expiry, not a fresh 67 days.
    return pg_catalog.jsonb_build_object('ok',true,'ownerUserId',u,'draft',private.questionnaire_draft_record(d));
   end if;
   if d.id<>draft_id or d.version<>expected or d.last_mutation_id=mutation then
    return pg_catalog.jsonb_build_object('ok',false,'reason','conflict');
   end if;
  end if;
 elsif expected<>0 then return pg_catalog.jsonb_build_object('ok',false,'reason','expired');
 end if;
 if d.id is null then
  -- A deleted expired draft must not be resurrected by retrying its original create.
  -- Creation issuance comes from a read before the first save and stays fixed for retries.
  -- A user may intentionally start a NEW draft with a new issuance; no permanent ID tombstones.
  if (_command->>'creationIssuedAt')::timestamptz<=at_time-interval '1608 hours'
   or (_command->>'creationIssuedAt')::timestamptz>at_time then
   return pg_catalog.jsonb_build_object('ok',false,'reason','expired');
  end if;
  if expected<>0 then return pg_catalog.jsonb_build_object('ok',false,'reason','conflict'); end if;
  insert into private.questionnaire_drafts(owner_user_id,id,version,payload,last_mutation_id,saved_at,expires_at)
  values(u,draft_id,1,_command->'payload',mutation,at_time,at_time+interval '1608 hours') returning * into d;
 else
  update private.questionnaire_drafts set version=version+1,payload=_command->'payload',last_mutation_id=mutation,
   saved_at=at_time,expires_at=at_time+interval '1608 hours' where owner_user_id=u and is_current returning * into d;
 end if;
 return pg_catalog.jsonb_build_object('ok',true,'ownerUserId',u,'draft',private.questionnaire_draft_record(d));
end $$;

create function private.questionnaire_draft_submit(_command jsonb,_draft jsonb) returns jsonb
language plpgsql security definer set search_path='' set lock_timeout='3s' as $$
declare u uuid:=private.r2_membership_session_owner(); d private.questionnaire_drafts; result jsonb;
begin
 if not private.r2_membership_command_valid(_command) or not private.r2_exact_keys(_draft,array['id','version'])
 or pg_catalog.jsonb_typeof(_draft->'id') is distinct from 'string'
 or (_draft->>'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or pg_catalog.jsonb_typeof(_draft->'version') is distinct from 'number'
 or (_draft->>'version')::numeric<1 or (_draft->>'version')::numeric>9007199254740991
 or (_draft->>'version')::numeric<>pg_catalog.trunc((_draft->>'version')::numeric) then
  raise exception 'invalid_draft_submission' using errcode='22023';
 end if;
 perform 1 from auth.users where id=u for update;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 -- Exact same replay contract, receipt and correlation as R2. No newly-created draft is deleted by replay.
 if exists(select 1 from public.membership_requests where owner_user_id=u and idempotency_key=(_command->>'idempotencyKey')::uuid) then
  return private.membership_questionnaire_submit(_command);
 end if;
 select * into d from private.questionnaire_drafts where owner_user_id=u and is_current for update;
 if not found or d.id<>(_draft->>'id')::uuid or d.version<>(_draft->>'version')::bigint or d.expires_at<=pg_catalog.clock_timestamp() then
  return pg_catalog.jsonb_build_object('ok',false,'reason','conflict');
 end if;
 result:=private.membership_questionnaire_submit(_command);
 if result->'ok'='true'::jsonb then delete from private.questionnaire_drafts where owner_user_id=u and id=d.id and version=d.version; end if;
 -- Creation, consent, metadata audit and clearing the draft commit or roll back together.
 return result;
end $$;

-- No expiry-purge function, scheduler or automatic physical deletion is created.

revoke all on table private.questionnaire_drafts from PUBLIC,anon,authenticated,service_role;
revoke all on function private.questionnaire_draft_text_valid(jsonb,integer) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.questionnaire_draft_payload_valid(jsonb) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.questionnaire_draft_record(private.questionnaire_drafts) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.questionnaire_draft_read() from PUBLIC,anon,authenticated,service_role;
revoke all on function private.questionnaire_draft_save(jsonb) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.questionnaire_draft_submit(jsonb,jsonb) from PUBLIC,anon,authenticated,service_role;
commit;
