-- LOCAL REVIEW PROPOSAL ONLY. Not a Supabase migration and not authorized for live apply.
-- Base: restricted_test_baseline.sql + id_trace_extension.sql from the closed TEST package.
-- No existing data is linked/backfilled; no API grants, wrappers, Auth hooks or delivery.
-- Applying this entire file is one transaction so default EXECUTE is revoked before commit.
begin;
set local search_path = '';
set local lock_timeout = '3s';

-- Frozen version definition: changing v3 semantics requires a new version/function.
create function private.r2_questionnaire_definition() returns jsonb
language sql immutable set search_path = '' as $definition$
 select $json${
  "questions": [
    {
      "id": "interests",
      "question": "Что увлекает тебя сильнее всего?",
      "options": [
        "Музыка и звук",
        "Искусство и творчество",
        "Люди и их истории",
        "Новые места и впечатления",
        "Идеи и технологии"
      ]
    },
    {
      "id": "social_role",
      "question": "Какая роль тебе ближе в компании?",
      "options": [
        "Начинаю разговоры",
        "Знакомлю людей между собой",
        "Внимательно слушаю",
        "Подхватываю чужие идеи",
        "Меняю роль по настроению"
      ]
    },
    {
      "id": "meeting_style",
      "question": "Как тебе приятнее знакомиться?",
      "options": [
        "Один на один",
        "В небольшой компании",
        "Через общее занятие",
        "Через знакомых",
        "Спонтанно, без повода"
      ]
    },
    {
      "id": "trust",
      "question": "Что помогает тебе довериться человеку?",
      "options": [
        "Постоянство в поступках",
        "Уважение к личному пространству",
        "Прямота в разговоре",
        "Общее чувство юмора",
        "Время, проведённое вместе"
      ]
    },
    {
      "id": "boundaries",
      "question": "Как ты показываешь, что тебе некомфортно?",
      "options": [
        "Говорю прямо",
        "Прошу сделать паузу",
        "Отхожу в сторону",
        "Показываю без слов",
        "Обсуждаю позже"
      ]
    },
    {
      "id": "discomfort",
      "question": "Что быстрее всего нарушает твой комфорт?",
      "options": [
        "Слишком много шума",
        "Мало личного пространства",
        "Непрошеное внимание",
        "Давление на участие",
        "Непонятные правила"
      ]
    },
    {
      "id": "motivation",
      "question": "За чем тебе хочется прийти в ВНЕ?",
      "options": [
        "За музыкой и атмосферой",
        "За новыми знакомствами",
        "За временем со своими",
        "За сменой обстановки",
        "За новыми впечатлениями"
      ]
    }
  ],
  "ratings": [
    {
      "id": "social_energy",
      "question": "Сколько общения тебе хочется этой ночью?",
      "minLabel": "Больше времени для себя",
      "maxLabel": "Знакомиться и общаться"
    },
    {
      "id": "evening_pace",
      "question": "Какой ритм вечера тебе ближе?",
      "minLabel": "Спокойный",
      "maxLabel": "Энергичный"
    },
    {
      "id": "spontaneity",
      "question": "Насколько тебе комфортна спонтанность?",
      "minLabel": "Люблю понятный план",
      "maxLabel": "Люблю неожиданные повороты"
    }
  ]
}$json$::jsonb;
$definition$;

-- Exact ECMAScript WhiteSpace + LineTerminator set, independent of database locale.
create function private.r2_js_trim(_text text) returns text
language sql immutable strict set search_path = '' as $$
 select pg_catalog.btrim(_text, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
$$;

create function private.r2_js_normalize(_text text) returns text
language sql immutable strict set search_path = '' as $$
 select pg_catalog.regexp_replace(pg_catalog.btrim(pg_catalog.translate(_text,
 U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF',
 pg_catalog.repeat(' ',25))), ' +', ' ', 'g');
$$;

-- JavaScript string.length is UTF-16 code units, not PostgreSQL character count.
create function private.r2_utf16_length(_text text) returns integer
language sql immutable strict set search_path = '' as $$
 select coalesce(sum(case when pg_catalog.ascii(pg_catalog.substr(_text,n,1))>65535 then 2 else 1 end),0)::integer
 from pg_catalog.generate_series(1,pg_catalog.char_length(_text)) n;
$$;

create function private.r2_exact_keys(_value jsonb, _keys text[]) returns boolean
language plpgsql immutable set search_path = '' as $$
begin
 if _value is null or pg_catalog.jsonb_typeof(_value) <> 'object' then return false; end if;
 return _value ?& _keys and _value - _keys = '{}'::jsonb;
end $$;

create function private.r2_questionnaire_valid(_value jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
 definition jsonb := private.r2_questionnaire_definition(); q jsonb; r jsonb; a jsonb; d jsonb;
 answer text; source text; selected text[]; custom_count integer; i integer; num numeric;
begin
 if not private.r2_exact_keys(_value,array['version','questions','ratings','age'])
 or _value->'version' is distinct from '3'::jsonb
 or pg_catalog.jsonb_typeof(_value->'questions') is distinct from 'array'
 or pg_catalog.jsonb_typeof(_value->'ratings') is distinct from 'array'
 or pg_catalog.jsonb_typeof(_value->'age') is distinct from 'number' then return false; end if;
 if pg_catalog.jsonb_array_length(_value->'questions')<>7
 or pg_catalog.jsonb_array_length(_value->'ratings')<>3 then return false; end if;
 num:=(_value->>'age')::numeric;
 if num<1 or num>100 or num<>pg_catalog.trunc(num) then return false; end if;
 for i in 0..6 loop
  q:=_value->'questions'->i; d:=definition->'questions'->i;
  if not private.r2_exact_keys(q,array['id','label','answers'])
  or q->'id' is distinct from d->'id' or q->'label' is distinct from d->'question'
  or pg_catalog.jsonb_typeof(q->'answers') is distinct from 'array' then return false; end if;
  if pg_catalog.jsonb_array_length(q->'answers') not between 1 and 3 then return false; end if;
  selected:=array[]::text[]; custom_count:=0;
  for a in select value from pg_catalog.jsonb_array_elements(q->'answers') loop
   if not private.r2_exact_keys(a,array['text','source'])
   or pg_catalog.jsonb_typeof(a->'text') is distinct from 'string'
   or pg_catalog.jsonb_typeof(a->'source') is distinct from 'string' then return false; end if;
   answer:=a->>'text'; source:=a->>'source';
   -- Bound invalid work before whitespace normalization and UTF-16 code-unit counting.
   if pg_catalog.char_length(answer)>120 then return false; end if;
   if answer='' or answer<>private.r2_js_normalize(answer)
   or private.r2_utf16_length(answer)>120
   or pg_catalog.cardinality(pg_catalog.string_to_array(answer,' '))>5
   or answer ~ '[\x01-\x1f\x7f]' or source not in ('choice','custom','manual') then return false; end if;
   if source='choice' then
    if not (d->'options' ? answer) or answer=any(selected) then return false; end if;
    selected:=pg_catalog.array_append(selected,answer);
   elsif source='custom' then
    custom_count:=custom_count+1;
    if custom_count>1 then return false; end if;
   end if;
  end loop;
 end loop;
 for i in 0..2 loop
  r:=_value->'ratings'->i; d:=definition->'ratings'->i;
  if not private.r2_exact_keys(r,array['id','label','minLabel','maxLabel','value'])
  or r->'id' is distinct from d->'id' or r->'label' is distinct from d->'question'
  or r->'minLabel' is distinct from d->'minLabel' or r->'maxLabel' is distinct from d->'maxLabel'
  or pg_catalog.jsonb_typeof(r->'value') is distinct from 'number' then return false; end if;
  num:=(r->>'value')::numeric;
  if num<1 or num>100 or num<>pg_catalog.trunc(num) then return false; end if;
 end loop;
 return true;
exception when others then return false;
end $$;

-- The DB accepts the already-normalized TypeScript command, not arbitrary wire input.
-- Contact email is NOT the owner or an authentication claim.
create function private.r2_membership_command_valid(_command jsonb) returns boolean
language plpgsql immutable set search_path = '' as $$
declare intake jsonb; value text;
begin
 if not private.r2_exact_keys(_command,array['idempotencyKey','intake','questionnaire','consentVersion'])
 or pg_catalog.jsonb_typeof(_command->'idempotencyKey') is distinct from 'string'
 or (_command->>'idempotencyKey') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or _command->'consentVersion' is distinct from '"draft-2026-09"'::jsonb
 or not private.r2_questionnaire_valid(_command->'questionnaire') then return false; end if;
 intake:=_command->'intake';
 if not private.r2_exact_keys(intake,array['displayName','email','telegramUsername','eventSlug'])
 or pg_catalog.jsonb_typeof(intake->'displayName') is distinct from 'string'
 or pg_catalog.jsonb_typeof(intake->'email') is distinct from 'string'
 or pg_catalog.jsonb_typeof(intake->'telegramUsername') is distinct from 'string'
 or pg_catalog.jsonb_typeof(intake->'eventSlug') not in ('string','null') then return false; end if;
 value:=intake->>'displayName';
 if pg_catalog.char_length(value)>80 then return false; end if;
 if value='' or value<>private.r2_js_trim(value) or private.r2_utf16_length(value)>80 then return false; end if;
 value:=intake->>'email';
 if pg_catalog.char_length(value)>254 then return false; end if;
 if value<>private.r2_js_trim(value) or value<>pg_catalog.lower(value) or private.r2_utf16_length(value)>254
 or value !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
 -- Reject the full JS whitespace set as well, including NBSP and BOM.
 or private.r2_js_normalize(value)<>value then return false; end if;
 value:=intake->>'telegramUsername';
 if value !~ '^[A-Za-z][A-Za-z0-9_]{4,31}$' then return false; end if;
 value:=intake->>'eventSlug';
 if value is not null and value !~ '^[a-z0-9-]{3,64}$' then return false; end if;
 return true;
exception when others then return false;
end $$;

alter table public.membership_requests
 add column owner_user_id uuid references auth.users(id) on delete restrict,
 add column questionnaire_snapshot jsonb,
 add column idempotency_key uuid,
 add column correlation_id uuid,
 add constraint membership_requests_questionnaire_shape check (
  (owner_user_id is null and questionnaire_snapshot is null and idempotency_key is null and correlation_id is null)
  or (owner_user_id is not null and questionnaire_snapshot is not null and idempotency_key is not null and correlation_id is not null
   and private.r2_questionnaire_valid(questionnaire_snapshot)
   and consent_version is not distinct from 'draft-2026-09'
   and consent_at is not null and consent_method is not distinct from 'web_form_checkbox'
   and invited_user_id is null and invited_at is null and current_invite_id is null)
 );

-- Exact old index: CREATE UNIQUE INDEX membership_requests_pending_email_uq
-- ON public.membership_requests USING btree (lower(email))
-- WHERE (status = 'pending'::public.membership_request_status).
-- New index adds AND owner_user_id IS NULL. Contacts never reserve another account's intake.
-- Preflight fails closed if this reviewed prerequisite has drifted. No data correction/backfill.
do $$
begin
 if (select pg_catalog.pg_get_indexdef('public.membership_requests_pending_email_uq'::regclass))
 <> 'CREATE UNIQUE INDEX membership_requests_pending_email_uq ON public.membership_requests USING btree (lower(email)) WHERE (status = ''pending''::public.membership_request_status)' then
  raise exception 'membership_questionnaire_baseline_index_drift';
 end if;
 if exists(select 1 from public.membership_requests where status='pending' and owner_user_id is null group by pg_catalog.lower(email) having count(*)>1)
 or exists(select 1 from public.membership_requests where status='pending' and owner_user_id is not null group by owner_user_id having count(*)>1)
 or exists(select 1 from public.membership_requests where owner_user_id is not null group by owner_user_id,idempotency_key having count(*)>1) then
  raise exception 'membership_questionnaire_duplicate_preflight';
 end if;
end $$;

drop index public.membership_requests_pending_email_uq;
create unique index membership_requests_pending_email_uq
 on public.membership_requests (pg_catalog.lower(email))
 where status='pending' and owner_user_id is null;
create unique index membership_requests_pending_owner_uq
 on public.membership_requests (owner_user_id)
 where status='pending' and owner_user_id is not null;
create unique index membership_requests_owner_idempotency_uq
 on public.membership_requests (owner_user_id,idempotency_key) where owner_user_id is not null;
create index membership_requests_owner_created_idx
 on public.membership_requests (owner_user_id,created_at desc,id) where owner_user_id is not null;

-- No UPDATE route may alter an owned original command or claim a legacy unowned request.
create function private.r2_membership_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
 if old.owner_user_id is null then
  if new.owner_user_id is not null or new.questionnaire_snapshot is not null
   or new.idempotency_key is not null or new.correlation_id is not null then
   raise exception 'membership_questionnaire_legacy_link_forbidden' using errcode='23514';
  end if;
 elsif row(new.id,new.owner_user_id,new.questionnaire_snapshot,new.idempotency_key,new.correlation_id,
  new.display_name,new.email,new.telegram_username,new.event_slug,new.created_at,
  new.consent_version,new.consent_at,new.consent_method)
 is distinct from row(old.id,old.owner_user_id,old.questionnaire_snapshot,old.idempotency_key,old.correlation_id,
  old.display_name,old.email,old.telegram_username,old.event_slug,old.created_at,
  old.consent_version,old.consent_at,old.consent_method) then
  raise exception 'membership_questionnaire_immutable' using errcode='23514';
 end if;
 return new;
end $$;
create trigger membership_questionnaire_immutable before update on public.membership_requests
 for each row execute function private.r2_membership_immutable();

-- Auth account + current session establishes ownership; email, D1, staff and admission do not.
-- Definer needed solely to read private session rows; all entrypoints remain uncallable to API roles.
create function private.r2_membership_session_owner() returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid; sid uuid;
begin
 begin
  u:=auth.uid(); sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 exception when others then raise exception 'forbidden' using errcode='42501'; end;
 if u is null or sid is null or auth.jwt()->>'role' is distinct from 'authenticated'
 or auth.jwt()->>'is_anonymous'='true'
 or not exists(select 1 from auth.users where id=u)
 or not exists(select 1 from auth.sessions where id=sid and user_id=u and (not_after is null or not_after>pg_catalog.clock_timestamp())) then
  raise exception 'forbidden' using errcode='42501';
 end if;
 return u;
end $$;

create function private.r2_membership_receipt(_row public.membership_requests) returns jsonb
language sql stable strict set search_path = '' as $$
 select pg_catalog.jsonb_build_object('requestId',_row.id,'ownerUserId',_row.owner_user_id,
  'correlationId',_row.correlation_id,'questionnaireVersion',3,'status',_row.status,'createdAt',_row.created_at);
$$;

create function private.membership_questionnaire_submit(_command jsonb) returns jsonb
language plpgsql security definer set search_path = '' set lock_timeout = '3s' as $$
declare u uuid:=private.r2_membership_session_owner(); key uuid; intake jsonb;
 r public.membership_requests; correlation uuid; constraint_name text;
begin
 if not private.r2_membership_command_valid(_command) then raise exception 'invalid_command' using errcode='22023'; end if;
 key:=(_command->>'idempotencyKey')::uuid; intake:=_command->'intake';
 -- Serialize owner operations, including differing keys and limiter checks. No auth data changes.
 perform 1 from auth.users where id=u for update;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 -- Recheck after waiting; hold the matching session against deletion or deadline changes until commit.
 perform 1 from auth.sessions where id=(auth.jwt()->>'session_id')::uuid and user_id=u
  and (not_after is null or not_after>pg_catalog.clock_timestamp()) for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 select * into r from public.membership_requests where owner_user_id=u and idempotency_key=key;
 if found then
  if r.questionnaire_snapshot is distinct from _command->'questionnaire'
  or row(r.display_name,r.email,r.telegram_username,r.event_slug,r.consent_version)
   is distinct from row(intake->>'displayName',intake->>'email',intake->>'telegramUsername',intake->>'eventSlug',_command->>'consentVersion') then
   return pg_catalog.jsonb_build_object('ok',false,'reason','conflict');
  end if;
  return pg_catalog.jsonb_build_object('ok',true,'receipt',private.r2_membership_receipt(r),'outcome','replay');
 end if;
 -- One currently pending general request per owner. A new key never overwrites it.
 if exists(select 1 from public.membership_requests where owner_user_id=u and status='pending') then
  return pg_catalog.jsonb_build_object('ok',false,'reason','conflict');
 end if;
 -- Preserve the conservative 30/hour threshold, scoped to authenticated account.
 -- Invalid/conflicting requests do not create rows. Edge/IP abuse controls remain a future transport responsibility.
 if (select count(*) from public.membership_requests where owner_user_id=u and created_at>pg_catalog.clock_timestamp()-interval '1 hour')>=30 then
  return pg_catalog.jsonb_build_object('ok',false,'reason','unavailable');
 end if;
 correlation:=pg_catalog.gen_random_uuid();
 begin
  insert into public.membership_requests(owner_user_id,questionnaire_snapshot,idempotency_key,correlation_id,
   display_name,email,telegram_username,event_slug,consent_version,consent_at,consent_method)
  values(u,_command->'questionnaire',key,correlation,intake->>'displayName',intake->>'email',intake->>'telegramUsername',intake->>'eventSlug',
   'draft-2026-09',pg_catalog.clock_timestamp(),'web_form_checkbox') returning * into r;
 exception when unique_violation then
  get stacked diagnostics constraint_name=CONSTRAINT_NAME;
  -- Protect against an unexpected concurrent writer that did not take the owner lock.
  -- Never look up a request by contact email or by another account's key.
  if constraint_name='membership_requests_owner_idempotency_uq' then
   select * into r from public.membership_requests where owner_user_id=u and idempotency_key=key;
   if found and r.questionnaire_snapshot=_command->'questionnaire'
    and row(r.display_name,r.email,r.telegram_username,r.event_slug,r.consent_version)
      is not distinct from row(intake->>'displayName',intake->>'email',intake->>'telegramUsername',intake->>'eventSlug',_command->>'consentVersion') then
    return pg_catalog.jsonb_build_object('ok',true,'receipt',private.r2_membership_receipt(r),'outcome','replay');
   end if;
   return pg_catalog.jsonb_build_object('ok',false,'reason','conflict');
  elsif constraint_name='membership_requests_pending_owner_uq' then
   return pg_catalog.jsonb_build_object('ok',false,'reason','conflict');
  end if;
  return pg_catalog.jsonb_build_object('ok',false,'reason','unavailable');
 end;
 insert into private.audit_log(actor,action,object_type,object_id,result,correlation_id,details)
 values(u,'membership_questionnaire.submitted','membership_request',r.id,'ok',correlation,
  pg_catalog.jsonb_build_object('request_id',r.id,'correlation_id',correlation));
 -- Intentionally no invitations, outbox, member_admission or event application writes.
 return pg_catalog.jsonb_build_object('ok',true,'receipt',private.r2_membership_receipt(r),'outcome','created');
end $$;

create function private.membership_questionnaire_read_own(_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.r2_membership_session_owner(); r public.membership_requests;
begin
 select * into r from public.membership_requests where id=_request and owner_user_id=u;
 if not found then return null; end if;
 return private.r2_membership_receipt(r);
end $$;

create function private.membership_questionnaire_list_own() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid:=private.r2_membership_session_owner(); result jsonb;
begin
 select coalesce(pg_catalog.jsonb_agg(private.r2_membership_receipt(r) order by r.created_at desc,r.id),'[]'::jsonb)
 into result from public.membership_requests r where r.owner_user_id=u;
 return result;
end $$;

-- Revocations occur in this transaction: nothing becomes callable between CREATE and REVOKE.
revoke all on schema private from PUBLIC,anon,authenticated,service_role;
revoke all on table public.membership_requests from PUBLIC,anon,authenticated,service_role;
revoke all on function private.r2_questionnaire_definition() from PUBLIC,anon,authenticated,service_role;
revoke all on function private.r2_js_trim(text) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.r2_js_normalize(text) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.r2_utf16_length(text) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.r2_exact_keys(jsonb,text[]) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.r2_questionnaire_valid(jsonb) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.r2_membership_command_valid(jsonb) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.r2_membership_immutable() from PUBLIC,anon,authenticated,service_role;
revoke all on function private.r2_membership_session_owner() from PUBLIC,anon,authenticated,service_role;
revoke all on function private.r2_membership_receipt(public.membership_requests) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.membership_questionnaire_submit(jsonb) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.membership_questionnaire_read_own(uuid) from PUBLIC,anon,authenticated,service_role;
revoke all on function private.membership_questionnaire_list_own() from PUBLIC,anon,authenticated,service_role;
commit;
