-- Регрессия по аудиту baseline 3e695e25. Только синтетика; claims через set_config (это НЕ реальный Auth/MFA).
\set ON_ERROR_STOP on
create or replace function pg_temp.ok(_c boolean, _n text) returns void language plpgsql as $$
begin if not coalesce(_c,false) then raise exception 'FAIL: %', _n; end if; raise notice 'PASS: %', _n; end $$;
create or replace function pg_temp.fails(_sql text, _state text, _n text) returns void language plpgsql as $$
declare s text; begin
  begin execute _sql; exception when others then s := sqlstate; end;
  if s is distinct from _state then raise exception 'FAIL (%/%): %', s, _state, _n; end if;
  raise notice 'PASS (%): %', _state, _n; end $$;
create or replace function pg_temp.as_user(_sub text, _aal text default 'aal2') returns void language plpgsql as $$
begin perform set_config('request.jwt.claims', json_build_object('sub',_sub,'role','authenticated','aal',_aal,
  'session_id','00000000-0000-4000-e000-'||right(_sub,12))::text, false); execute 'set role authenticated'; end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- fixtures
insert into auth.users(id,email) values ('00000000-0000-4000-a000-0000000000e1','editor@example.invalid'),
  ('00000000-0000-4000-a000-0000000000e2','invitee@example.invalid'),
  ('00000000-0000-4000-a000-0000000000e3','mod-fresh@example.invalid');
insert into auth.sessions(id,user_id) values ('00000000-0000-4000-e000-0000000000e1','00000000-0000-4000-a000-0000000000e1'),
  ('00000000-0000-4000-e000-0000000000e3','00000000-0000-4000-a000-0000000000e3');
insert into public.staff_assignments(user_id,role,event_id,valid_until) values ('00000000-0000-4000-a000-0000000000e3','moderator','00000000-0000-4000-b000-000000000002', now() + interval '30 days');
insert into public.staff_assignments(user_id,role) values ('00000000-0000-4000-a000-0000000000e1','editor');
insert into public.membership_requests(id,email,display_name,telegram_username) values
  ('00000000-0000-4000-9000-000000000001','m1@example.invalid','M1','synthetic_m1'),
  ('00000000-0000-4000-9000-000000000002','m2@example.invalid','M2','synthetic_m2');

insert into public.applications(id,event_id,user_id) values ('00000000-0000-4000-d000-0000000000e1','00000000-0000-4000-b000-000000000001','00000000-0000-4000-a000-0000000000e2');

-- capabilities
select pg_temp.as_user('00000000-0000-4000-a000-0000000000e1');
select pg_temp.ok(public.staff_can('content'), 'editor: content allowed');
select pg_temp.ok(not public.staff_can('membership'), 'editor: membership denied');
select pg_temp.ok(not public.staff_can('team'), 'editor: team denied');
select pg_temp.fails($$select public.membership_decide('00000000-0000-4000-9000-000000000001','approved')$$,'42501','editor cannot decide membership');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-0000000000e3');
select pg_temp.ok(public.my_staff_access('admin'), 'event moderator: admin shell allowed (any current assignment)');
select pg_temp.ok(not public.staff_can('membership'), 'event moderator: membership denied');
select pg_temp.ok(public.staff_can('event_moderate','00000000-0000-4000-b000-000000000002'), 'moderator: own event allowed');
select pg_temp.ok(not public.staff_can('event_moderate','00000000-0000-4000-b000-000000000001'), 'moderator: other event denied');
select pg_temp.ok(not public.staff_can('event_moderate', null), 'moderator: null event denied');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-0000000000c3');
select pg_temp.ok(not public.my_staff_access('admin'), 'revoked moderator: shell denied');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-0000000000e3','aal1');
select pg_temp.ok(not public.my_staff_access('admin'), 'moderator aal1: shell denied');
reset role;

-- grant_staff_assignment
select pg_temp.as_user('00000000-0000-4000-a000-0000000000d1');
select pg_temp.fails($$select public.grant_staff_assignment('guest-a@example.invalid','moderator')$$,'22023','event role without event rejected');
select pg_temp.fails($$select public.grant_staff_assignment('guest-a@example.invalid','moderator','00000000-0000-4000-b000-000000000001', now() - interval '1 day')$$,'22023','expiry in past rejected');
select pg_temp.fails($$select public.grant_staff_assignment('guest-a@example.invalid','scanner','00000000-0000-4000-b000-000000000001')$$,'22023','event role without expiry rejected (RPC)');
select pg_temp.fails($$select public.grant_staff_assignment('guest-a@example.invalid','editor','00000000-0000-4000-b000-000000000001')$$,'22023','global role with event rejected');
select pg_temp.fails($$select public.grant_staff_assignment('guest-a@example.invalid','owner')$$,'42501','owner not grantable');
select pg_temp.fails($$select public.grant_staff_assignment('guest-a@example.invalid','admin')$$,'42501','admin cannot grant admin');
select pg_temp.ok(public.grant_staff_assignment('guest-a@example.invalid','moderator','00000000-0000-4000-b000-000000000002', now() + interval '1 day') is not null, 'scoped moderator grant ok');

-- membership_decide: atomic, noop on repeat, single active invite, outbox held
select pg_temp.ok((public.membership_decide('00000000-0000-4000-9000-000000000001','approved'))->>'result' = 'changed', 'admin approves once');
select pg_temp.ok((public.membership_decide('00000000-0000-4000-9000-000000000001','rejected'))->>'result' = 'noop', 'second decision is noop');
select pg_temp.ok((public.membership_decide('00000000-0000-4000-9000-000000000001','approved'))->>'result' = 'noop', 'repeat approve is noop');
reset role;
select pg_temp.ok((select count(*) from public.invites where request_id='00000000-0000-4000-9000-000000000001' and status in ('created','sent'))=1, 'exactly one active invite');
select pg_temp.ok((select count(*) from private.outbox where topic='membership.decided' and status='held')=1, 'one held outbox job, no delivery');
select pg_temp.ok((select count(*) from private.audit_log where object_id='00000000-0000-4000-9000-000000000001' and result='noop')=2, 'noop decisions audited');
select pg_temp.fails($$insert into public.invites(code,request_id,email) values ('VNE-DUPL-0001','00000000-0000-4000-9000-000000000001','m1@example.invalid')$$,'23505','second active invite blocked by index');

-- accept_invite: link bound to token_hash; revoked/replaced/expired/wrong link must not pass
reset role;
update public.invites set status='sent', invited_user_id='00000000-0000-4000-a000-0000000000e2', token_hash='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' where request_id='00000000-0000-4000-9000-000000000001' and status in ('created','sent');
select set_config('request.jwt.claims','{"role":"service_role"}',false);
select pg_temp.ok(public.accept_invite('00000000-0000-4000-a000-0000000000e2')='denied', 'no token → denied');
select pg_temp.ok(public.accept_invite('00000000-0000-4000-a000-0000000000e2','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')='denied', 'replaced/old token of same user cannot accept new current invite');
update public.invites set status='revoked', revoked_at=now() where token_hash='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
select pg_temp.ok(public.accept_invite('00000000-0000-4000-a000-0000000000e2','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')='denied', 'revoked invite link denied');
update public.invites set status='sent', revoked_at=null, expires_at=now()-interval '1 minute' where token_hash='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
select pg_temp.ok(public.accept_invite('00000000-0000-4000-a000-0000000000e2','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')='denied', 'expired invite link denied');
update public.invites set expires_at=now()+interval '1 day' where token_hash='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
select pg_temp.ok(public.accept_invite('00000000-0000-4000-a000-0000000000e1','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')='not_required' or public.accept_invite('00000000-0000-4000-a000-0000000000e1','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')='denied', 'token of another user never accepts for them');
select pg_temp.ok((select status from public.invites where token_hash='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')='sent', 'foreign-user attempt changed nothing');
select pg_temp.ok(public.accept_invite('00000000-0000-4000-a000-0000000000e2','bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb')='accepted', 'current token accepted');
select pg_temp.ok(public.accept_invite('00000000-0000-4000-a000-0000000000e2','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')='not_required', 'active member recovery/login not broken');
select pg_temp.ok(public.accept_invite('00000000-0000-4000-a000-00000000000a')='not_required', 'user without invites (recovery/login) unaffected');
select pg_temp.fails($$select public.mark_invite(gen_random_uuid(), true)$$,'22023','mark sent without token hash rejected');
select set_config('request.jwt.claims','',false);

-- applications: stale version, moderation scoping
select pg_temp.as_user('00000000-0000-4000-a000-0000000000c1');
select pg_temp.ok(public.moderate_application('00000000-0000-4000-d000-0000000000e1','take',1)='under_review', 'owner/admin-scoped staff takes (v1→v2)');
select pg_temp.fails($$select public.moderate_application('00000000-0000-4000-d000-0000000000e1','approve',1)$$,'PT409','second moderator with stale version rejected');
select pg_temp.fails($$select public.moderate_application('00000000-0000-4000-d000-0000000000e1','request_info',2)$$,'22023','request_info requires public message');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-0000000000e3');
select pg_temp.fails($$select public.moderate_application('00000000-0000-4000-d000-0000000000e1','approve',2)$$,'42501','other-event moderator denied');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-0000000000c3');
select pg_temp.fails($$select public.moderate_application('00000000-0000-4000-d000-0000000000e1','approve',2)$$,'42501','revoked moderator denied');
reset role;
select pg_temp.as_user('00000000-0000-4000-a000-00000000000a','aal1');
select pg_temp.fails($$select public.submit_application('00000000-0000-4000-b000-000000000002','A',false,'draft-2026-09',gen_random_uuid())$$,'22023','age not confirmed rejected');
select pg_temp.fails($$select public.submit_application('00000000-0000-4000-b000-000000000002','A',true,'',gen_random_uuid())$$,'22023','missing consent version rejected');
select pg_temp.fails($$select public.submit_application('00000000-0000-4000-b000-000000000002','A',true,'arbitrary-v9',gen_random_uuid())$$,'22023','arbitrary consent version rejected');
reset role;

-- Колоночные INSERT/UPDATE на applications/application_events у anon/authenticated отсутствуют.
do $$ begin
  if exists (select 1 from information_schema.column_privileges where table_schema='public'
     and table_name in ('applications','application_events') and grantee in ('anon','authenticated')
     and privilege_type in ('INSERT','UPDATE')) then raise exception 'FAIL: column grants remain'; end if;
  raise notice 'PASS: no column INSERT/UPDATE grants for anon/authenticated';
end $$;
