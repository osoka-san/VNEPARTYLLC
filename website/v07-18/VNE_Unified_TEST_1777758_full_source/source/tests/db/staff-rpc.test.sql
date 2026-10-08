-- Матрица my_staff_access на синтетических пользователях seed. Любой FAIL → exit != 0.
insert into auth.sessions (id, user_id) values
  ('00000000-0000-4000-f000-0000000000d1', '00000000-0000-4000-a000-0000000000d1'),
  ('00000000-0000-4000-f000-0000000000c1', '00000000-0000-4000-a000-0000000000c1'),
  ('00000000-0000-4000-f000-0000000000c3', '00000000-0000-4000-a000-0000000000c3'),
  ('00000000-0000-4000-f000-00000000000a', '00000000-0000-4000-a000-00000000000a');

create function pg_temp.probe(_sub text, _aal text, _sess text, _area text) returns boolean
language plpgsql as $$
declare r boolean;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', _sub, 'aal', _aal, 'session_id', _sess, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.my_staff_access(_area);
  reset role;
  return r;
end $$;

do $$
declare
  adm text := '00000000-0000-4000-a000-0000000000d1';
  s_adm text := '00000000-0000-4000-f000-0000000000d1';
begin
  if not pg_temp.probe(adm, 'aal2', s_adm, 'admin') then raise exception 'FAIL admin aal2 denied admin'; end if;
  if not pg_temp.probe(adm, 'aal2', s_adm, 'scan') then raise exception 'FAIL admin aal2 denied scan'; end if;
  if pg_temp.probe(adm, 'aal1', s_adm, 'admin') then raise exception 'FAIL admin aal1 admitted'; end if;
  if pg_temp.probe(adm, 'aal2', gen_random_uuid()::text, 'admin') then raise exception 'FAIL dead session admitted'; end if;
  if pg_temp.probe(adm, 'aal2', s_adm, 'other') then raise exception 'FAIL unknown area admitted'; end if;
  if pg_temp.probe('00000000-0000-4000-a000-00000000000a', 'aal2', '00000000-0000-4000-f000-00000000000a', 'admin')
    or pg_temp.probe('00000000-0000-4000-a000-00000000000a', 'aal2', '00000000-0000-4000-f000-00000000000a', 'scan')
    then raise exception 'FAIL guest admitted'; end if;
  if pg_temp.probe('00000000-0000-4000-a000-0000000000c1', 'aal2', '00000000-0000-4000-f000-0000000000c1', 'scan')
    then raise exception 'FAIL event moderator admitted to scan'; end if;
  if pg_temp.probe('00000000-0000-4000-a000-0000000000c3', 'aal2', '00000000-0000-4000-f000-0000000000c3', 'admin')
    or pg_temp.probe('00000000-0000-4000-a000-0000000000c3', 'aal2', '00000000-0000-4000-f000-0000000000c3', 'scan')
    then raise exception 'FAIL revoked assignment admitted'; end if;
  delete from auth.sessions where id = s_adm::uuid;
  if pg_temp.probe(adm, 'aal2', s_adm, 'admin') then raise exception 'FAIL old JWT after logout admitted'; end if;
  raise notice 'PASS staff rpc: admin aal2 allowed; aal1, dead/logged-out session, guest, event moderator(scan), revoked, unknown area denied';
end $$;

set role anon;
do $$ begin
  perform public.my_staff_access('admin');
  raise exception 'FAIL anon can execute my_staff_access';
exception when insufficient_privilege then raise notice 'PASS anon cannot execute my_staff_access';
end $$;
reset role;
