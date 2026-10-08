-- Регрессия review 04: effective privileges при legacy default grants, tampering, revoke-семантика,
-- bootstrap повтор, mismatched/expired session. Stub PostgreSQL, НЕ настоящий Supabase/PostgREST.
\set ON_ERROR_STOP on
create or replace function pg_temp.ok(_cond boolean, _name text) returns void language plpgsql as $$
begin
  if not coalesce(_cond, false) then raise exception 'FAIL: %', _name; end if;
  raise notice 'PASS: %', _name;
end $$;
create or replace function pg_temp.fails(_sql text, _state text, _name text) returns void language plpgsql as $$
begin
  begin execute _sql; exception when others then
    if sqlstate = _state then raise notice 'PASS (%): %', _state, _name; return; end if;
    raise exception 'FAIL: % → unexpected % %', _name, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL (allowed): %', _name;
end $$;
create or replace function pg_temp.as_user(_sub text, _aal text, _sid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', _sub, 'role', 'authenticated',
    'aal', _aal, 'session_id', _sid)::text, false);
  execute 'set role authenticated';
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- 1. Legacy default privileges действительно были активны (иначе тест ничего не доказывает)
select pg_temp.ok(exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname = 'public' and d.defaclobjtype = 'r' and d.defaclacl::text like '%authenticated=%'),
  'legacy default privileges active for public tables');

-- 2. Effective column/table privileges
select pg_temp.ok(not has_column_privilege('authenticated', 'public.applications', c, 'UPDATE'),
  'authenticated cannot UPDATE applications.' || c)
  from unnest(array['id','event_id','user_id','note','reviewed_by','created_at','updated_at']) c;
select pg_temp.ok(not has_column_privilege('authenticated', 'public.applications', 'status', 'UPDATE'), 'day05: authenticated has no direct UPDATE applications.status (RPC only)');
select pg_temp.ok(not has_column_privilege('authenticated', 'public.applications', c, 'INSERT'),
  'authenticated cannot INSERT applications.' || c)
  from unnest(array['id','user_id','status','reviewed_by','created_at','updated_at']) c;
select pg_temp.ok(not has_column_privilege('authenticated', 'public.applications', 'event_id', 'INSERT')
  and not has_column_privilege('authenticated', 'public.applications', 'note', 'INSERT'), 'day05: authenticated has no direct INSERT on applications (RPC only)');
select pg_temp.ok(not has_column_privilege('authenticated', 'public.profiles', c, 'UPDATE'), 'authenticated cannot UPDATE profiles.' || c)
  from unnest(array['id','created_at']) c;
select pg_temp.ok(not has_table_privilege(r, t, p), r || ' has no ' || p || ' on ' || t)
  from unnest(array['anon','authenticated']) r,
       unnest(array['public.profiles','public.events','public.staff_assignments','public.applications']) t,
       unnest(array['DELETE','TRUNCATE','REFERENCES','TRIGGER']) p;
select pg_temp.ok(not has_table_privilege(r, t, p), r || ' has no ' || p || ' on ' || t)
  from unnest(array['anon','authenticated']) r,
       unnest(array['public.events','public.staff_assignments']) t,
       unnest(array['INSERT','UPDATE']) p;
select pg_temp.ok(not has_table_privilege('anon', t, p), 'anon has no ' || p || ' on ' || t)
  from unnest(array['public.profiles','public.staff_assignments','public.applications']) t,
       unnest(array['SELECT','INSERT','UPDATE']) p;
select pg_temp.ok(not has_function_privilege('anon', 'public.my_staff_access(text)', 'execute')
  and not has_function_privilege('anon', 'public.revoke_staff_assignment(uuid)', 'execute'), 'anon has no execute on RPC despite default privileges');

-- 3. Guest tampering при submitted→withdrawn: все чужие колонки неизменны
insert into public.events (id, slug, title, status) values
  ('00000000-0000-4000-b000-0000000000f1', 'tamper-test-01', 'Synthetic', 'published');
insert into public.applications (id, event_id, user_id) values
  ('00000000-0000-4000-d000-0000000000f1', '00000000-0000-4000-b000-0000000000f1', '00000000-0000-4000-a000-00000000000a');
create temp table snap as select * from public.applications where id = '00000000-0000-4000-d000-0000000000f1';
grant select on snap to authenticated;
select pg_temp.as_user('00000000-0000-4000-a000-00000000000a', 'aal1', '00000000-0000-4000-f000-00000000000a');
select pg_temp.fails($$update public.applications set status='withdrawn', event_id='00000000-0000-4000-b000-000000000001' where id='00000000-0000-4000-d000-0000000000f1'$$, '42501', 'guest cannot change event_id while withdrawing');
select pg_temp.fails($$update public.applications set status='withdrawn', id=gen_random_uuid() where id='00000000-0000-4000-d000-0000000000f1'$$, '42501', 'guest cannot change id while withdrawing');
select pg_temp.fails($$update public.applications set status='withdrawn', reviewed_by=auth.uid() where id='00000000-0000-4000-d000-0000000000f1'$$, '42501', 'guest cannot set reviewed_by while withdrawing');
select pg_temp.fails($$update public.applications set status='withdrawn', created_at='2000-01-01', updated_at='2000-01-01' where id='00000000-0000-4000-d000-0000000000f1'$$, '42501', 'guest cannot change timestamps while withdrawing');
select pg_temp.fails($$insert into public.applications (id, event_id, reviewed_by, created_at) values (gen_random_uuid(), '00000000-0000-4000-b000-000000000002', auth.uid(), '2000-01-01')$$, '42501', 'guest cannot insert id/reviewed_by/created_at');
reset role;
select pg_temp.ok((select row(a.*)::text from public.applications a where id = '00000000-0000-4000-d000-0000000000f1')
  = (select row(s.*)::text from snap s), 'application row byte-identical after tampering attempts');
select pg_temp.as_user('00000000-0000-4000-a000-00000000000a', 'aal1', '00000000-0000-4000-f000-00000000000a');
select public.guest_application_action('00000000-0000-4000-d000-0000000000f1', 'withdraw', 1);
reset role;
select pg_temp.ok((select a.status = 'withdrawn' and a.event_id = s.event_id and a.reviewed_by is null and a.created_at = s.created_at
  from public.applications a, snap s where a.id = s.id), 'legit withdraw via RPC changes only status/version');

-- 4. staff_session_ok: чужая и истёкшая сессия не дают прав даже с aal2
insert into auth.sessions (id, user_id, not_after) values
  ('00000000-0000-4000-f000-0000000000e1', '00000000-0000-4000-a000-0000000000d1', now() - interval '1 minute'),
  ('00000000-0000-4000-f000-0000000000e2', '00000000-0000-4000-a000-0000000000d1', now() + interval '1 hour');
select pg_temp.as_user('00000000-0000-4000-a000-0000000000d1', 'aal2', '00000000-0000-4000-f000-0000000000c1');
select pg_temp.ok(not public.my_staff_access('admin'), 'admin with another user''s session_id denied');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-0000000000d1', 'aal2', '00000000-0000-4000-f000-0000000000e1');
select pg_temp.ok(not public.my_staff_access('admin'), 'admin with expired session (not_after) denied');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-0000000000d1', 'aal1', '00000000-0000-4000-f000-0000000000e2');
select pg_temp.ok(not public.my_staff_access('admin'), 'admin aal1 on valid session still denied (MFA not weakened)');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-0000000000d1', 'aal2', '00000000-0000-4000-f000-0000000000e2');
select pg_temp.ok(public.my_staff_access('admin'), 'admin aal2 on own unexpired session allowed');

-- 5. revoke_staff_assignment: revoked / already_revoked (noop) / not found / owner
reset role;
create temp table a0 as select count(*) filter (where result='ok') ok, count(*) filter (where result='noop') noop from private.audit_log where action='staff.revoke';
select pg_temp.as_user('00000000-0000-4000-a000-0000000000d1', 'aal2', '00000000-0000-4000-f000-0000000000e2');
select pg_temp.ok(public.revoke_staff_assignment('00000000-0000-4000-c000-000000000002') = 'revoked', 'revoke active → revoked');
select pg_temp.ok(public.revoke_staff_assignment('00000000-0000-4000-c000-000000000002') = 'already_revoked', 'repeat revoke → already_revoked (idempotent)');
select pg_temp.fails($$select public.revoke_staff_assignment(gen_random_uuid())$$, 'P0002', 'revoke nonexistent → not found');
reset role;
select private.bootstrap_first_owner('00000000-0000-4000-a000-00000000000b') where not exists
  (select 1 from public.staff_assignments where role = 'owner' and revoked_at is null);
select pg_temp.as_user('00000000-0000-4000-a000-0000000000d1', 'aal2', '00000000-0000-4000-f000-0000000000e2');
select pg_temp.fails(format('select public.revoke_staff_assignment(%L)', (select id from public.staff_assignments where role='owner' limit 1)), '42501', 'revoke owner → forbidden');
reset role;
select pg_temp.ok((select count(*) filter (where result='ok') from private.audit_log where action='staff.revoke') = (select ok from a0) + 1, 'exactly one ok audit (no false success)');
select pg_temp.ok((select count(*) filter (where result='noop') from private.audit_log where action='staff.revoke') = (select noop from a0) + 1, 'repeat logged as noop');
select pg_temp.ok((select count(*) from public.staff_assignments where role='owner' and revoked_at is null) = 1, 'owner still active after forbidden revoke');

-- 6. bootstrap: повторный вызов отклонён, owner ровно один
select pg_temp.fails($$select private.bootstrap_first_owner('00000000-0000-4000-a000-00000000000a')$$, '42501', 'repeat bootstrap rejected');
select pg_temp.ok((select count(*) from public.staff_assignments where role='owner') = 1, 'exactly one owner after concurrent + repeat bootstrap');
