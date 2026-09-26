-- Исполняемая матрица доступа. Любой провал = exception и ненулевой код psql (ON_ERROR_STOP).
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(_sub text, _aal text default 'aal1', _sid text default null) returns void language plpgsql as $$
begin
  -- session_id по умолчанию = синтетическая сессия этого пользователя (e000 + хвост uuid)
  perform set_config('request.jwt.claims', json_build_object('sub', _sub, 'role', 'authenticated', 'aal', _aal,
    'session_id', coalesce(_sid, '00000000-0000-4000-e000-' || right(_sub, 12)))::text, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.ok(_cond boolean, _name text) returns void language plpgsql as $$
begin
  if not coalesce(_cond, false) then raise exception 'FAIL: %', _name; end if;
  raise notice 'PASS: %', _name;
end $$;
create or replace function pg_temp.denied(_sql text, _name text) returns void language plpgsql as $$
begin
  begin execute _sql; exception when insufficient_privilege or check_violation or raise_exception or invalid_parameter_value or serialization_failure or undefined_function or sqlstate 'PT409' or sqlstate 'PT422' then
    raise notice 'PASS (denied): %', _name; return; end;
  raise exception 'FAIL (allowed): %', _name;
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- anon
set role anon;
select pg_temp.ok((select count(*) from public.events) = 2, 'anon sees only published events');
select pg_temp.denied('select * from public.applications', 'anon cannot read applications');
select pg_temp.denied('select * from public.profiles', 'anon cannot read profiles');
select pg_temp.denied($$select public.review_application('00000000-0000-4000-d000-00000000000a','approved')$$, 'anon cannot call review RPC');
select pg_temp.denied('select * from private.audit_log', 'anon cannot read audit');
reset role;

-- guest A
select pg_temp.as_user('00000000-0000-4000-a000-00000000000a');
select pg_temp.ok((select count(*) from public.applications) = 1, 'guest A sees only own application');
select pg_temp.ok((select count(*) from public.applications where user_id = '00000000-0000-4000-a000-00000000000b') = 0, 'guest A cannot read guest B');
select pg_temp.ok((select count(*) from public.profiles) = 1, 'guest A sees only own profile');
select pg_temp.denied($$insert into public.applications (event_id, user_id) values ('00000000-0000-4000-b000-000000000002','00000000-0000-4000-a000-00000000000b')$$, 'guest A cannot insert as user B (user_id spoof)');
select pg_temp.denied($$insert into public.applications (event_id, status) values ('00000000-0000-4000-b000-000000000002','approved')$$, 'guest A cannot self-approve on insert');
select pg_temp.denied($$insert into public.applications (event_id) values ('00000000-0000-4000-b000-000000000003')$$, 'guest A cannot apply to draft event');
select pg_temp.denied($$update public.applications set status='approved' where user_id = auth.uid()$$, 'guest A cannot approve own application');
select pg_temp.denied($$update public.applications set user_id='00000000-0000-4000-a000-00000000000b'$$, 'guest A cannot change owner column');
select pg_temp.denied($$insert into public.staff_assignments (user_id, role) values (auth.uid(),'admin')$$, 'guest A cannot grant self a role');
select pg_temp.denied($$select public.review_application('00000000-0000-4000-d000-00000000000b','approved')$$, 'guest A cannot call review RPC');
select pg_temp.denied($$select private.bootstrap_first_owner(auth.uid())$$, 'guest A cannot bootstrap owner');
select pg_temp.denied($$update public.applications set status='rejected' where user_id='00000000-0000-4000-a000-00000000000b'$$, 'guest A cannot update B (no direct write)');
select pg_temp.denied($$select public.guest_application_action('00000000-0000-4000-d000-00000000000b','withdraw',1)$$, 'guest A cannot withdraw B via RPC (id substitution)');
reset role;
select pg_temp.ok((select status from public.applications where id='00000000-0000-4000-d000-00000000000b')='submitted', 'DB unchanged: B application still submitted');
select pg_temp.ok((select user_id from public.applications where id='00000000-0000-4000-d000-00000000000a')='00000000-0000-4000-a000-00000000000a' and (select status from public.applications where id='00000000-0000-4000-d000-00000000000a')='submitted', 'DB unchanged: A owner/status intact after denied updates');
select pg_temp.ok((select count(*) from public.staff_assignments where user_id='00000000-0000-4000-a000-00000000000a')=0, 'DB unchanged: no role rows for guest A');
select pg_temp.as_user('00000000-0000-4000-a000-00000000000a');
select pg_temp.denied($$select public.guest_application_action('00000000-0000-4000-d000-00000000000a','withdraw',99)$$, 'guest A stale version rejected');
select pg_temp.denied($$select public.guest_application_action('00000000-0000-4000-d000-00000000000a','withdraw',null)$$, 'guest A NULL version rejected');
select pg_temp.ok(public.guest_application_action('00000000-0000-4000-d000-00000000000a','withdraw',1) = 'withdrawn', 'guest A can withdraw own application via RPC');
reset role;

-- moderator of event A without MFA
select pg_temp.as_user('00000000-0000-4000-a000-0000000000c1', 'aal1');
select pg_temp.ok((select count(*) from public.applications) = 0, 'moderator aal1 sees no guest applications');
select pg_temp.denied($$select public.review_application('00000000-0000-4000-d000-00000000000b','approved')$$, 'moderator aal1 cannot review (MFA required)');
reset role;

-- moderator of event A with MFA
select pg_temp.as_user('00000000-0000-4000-a000-0000000000c1', 'aal2');
select pg_temp.ok((select count(*) from public.applications) = 2, 'moderator aal2 sees assigned event applications');
select pg_temp.denied($$select public.review_application('00000000-0000-4000-d000-00000000000b','approved')$$, 'legacy review_application removed: moderator aal2 cannot bypass CAS/history/outbox');
select pg_temp.denied($$select public.moderate_application('00000000-0000-4000-d000-00000000000b','take',null)$$, 'moderator NULL version rejected');
select pg_temp.denied($$select public.moderate_application('00000000-0000-4000-d000-00000000000b','take',7)$$, 'moderator stale version rejected');
select pg_temp.ok(public.moderate_application('00000000-0000-4000-d000-00000000000b','take',1) = 'under_review', 'moderator aal2 takes via CAS path');
select pg_temp.ok(public.moderate_application('00000000-0000-4000-d000-00000000000b','approve',2) = 'approved', 'moderator aal2 approves only via moderate_application (version+history+outbox)');
select pg_temp.denied($$select public.review_application('00000000-0000-4000-d000-00000000000a','approved')$$, 'moderator cannot review withdrawn (invalid transition)');
select pg_temp.denied($$select public.revoke_staff_assignment('00000000-0000-4000-c000-000000000002')$$, 'moderator cannot revoke staff');
reset role;

-- moderator of other event
select pg_temp.as_user('00000000-0000-4000-a000-0000000000c2', 'aal2');
select pg_temp.ok((select count(*) from public.applications) = 0, 'foreign-event moderator sees nothing');
reset role;

-- revoked moderator
select pg_temp.as_user('00000000-0000-4000-a000-0000000000c3', 'aal2');
select pg_temp.ok((select count(*) from public.applications) = 0, 'revoked moderator sees nothing');
reset role;

-- logout: сессия модератора B удалена, старый JWT с aal2 больше не даёт прав
delete from auth.sessions where id='00000000-0000-4000-e000-0000000000c2';
insert into public.applications (id, event_id, user_id) values ('00000000-0000-4000-d000-0000000000b2','00000000-0000-4000-b000-000000000002','00000000-0000-4000-a000-00000000000b');
select pg_temp.as_user('00000000-0000-4000-a000-0000000000c2', 'aal2');
select pg_temp.ok((select count(*) from public.applications) = 0, 'after logout old aal2 JWT sees nothing');
select pg_temp.denied($$select public.moderate_application('00000000-0000-4000-d000-0000000000b2','approve',1)$$, 'after logout old JWT cannot review');
reset role;
select pg_temp.ok((select status from public.applications where id='00000000-0000-4000-d000-0000000000b2')='submitted', 'DB unchanged after post-logout attempt');

-- admin revokes moderator A; effect is immediate within same JWT
select pg_temp.as_user('00000000-0000-4000-a000-0000000000d1', 'aal2');
select public.revoke_staff_assignment('00000000-0000-4000-c000-000000000001');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-0000000000c1', 'aal2');
select pg_temp.ok((select count(*) from public.applications) = 0, 'moderator loses access immediately after revoke');
reset role;
insert into public.applications (id, event_id, user_id) values ('00000000-0000-4000-d000-0000000000a3','00000000-0000-4000-b000-000000000001','00000000-0000-4000-a000-0000000000d1');
reset role;

select pg_temp.as_user('00000000-0000-4000-a000-0000000000c1', 'aal2');
select pg_temp.denied($$select public.moderate_application('00000000-0000-4000-d000-0000000000a3','approve',1)$$, 'revoked role with old JWT cannot review');
reset role;
select pg_temp.ok((select status from public.applications where id='00000000-0000-4000-d000-0000000000a3')='submitted', 'DB unchanged after revoked-role attempt');

-- audit/outbox written, no secrets
select pg_temp.ok((select count(*) from private.audit_log where action='application.review') = 0, 'no legacy review audit entries');
select pg_temp.ok((select count(*) from public.application_events where application_id='00000000-0000-4000-d000-00000000000b' and to_status='approved') = 1, 'approval recorded in history');
select pg_temp.ok((select count(*) from private.audit_log where action='staff.revoke' and result='ok') = 1, 'audit ok entry for revoke');
select pg_temp.ok(not exists (select 1 from private.audit_log where details::text ~* '(password|token|secret)'), 'audit contains no secrets');
select pg_temp.ok((select count(*) from private.outbox) >= 1 and not exists (select 1 from private.outbox where status='sent'), 'outbox written, nothing sent');

-- grants sanity: no PUBLIC execute on SECURITY DEFINER functions
select pg_temp.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef and n.nspname in ('public','private')
    and has_function_privilege('anon', p.oid, 'execute')), 'anon has no EXECUTE on any SECURITY DEFINER function');
select pg_temp.ok(not exists (
  select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef and n.nspname in ('public','private')
    and not (p.proconfig @> array['search_path=""'])), 'all SECURITY DEFINER functions pin search_path');
select pg_temp.ok(not exists (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity), 'RLS enabled on all public tables');
