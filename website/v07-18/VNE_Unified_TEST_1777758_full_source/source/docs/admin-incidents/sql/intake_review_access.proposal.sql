-- SEPARATE ACCESS EXPANSION. Exact action-time approval required. No staff assignment.
begin;
set local search_path='';
set local lock_timeout='3s';
do $$ begin
 if current_user<>'postgres' or (select count(*) from pg_proc where oid in (
   to_regprocedure('private.vne_intake_list(text,integer)'),to_regprocedure('private.vne_intake_read(uuid)'),
   to_regprocedure('private.vne_intake_review(jsonb)')) and proowner=(select oid from pg_roles where rolname=current_user))<>3 then
   raise exception 'intake_wrapper_owner_mismatch';
 end if;
end $$;
create function public.vne_intake_list(_status text default null,_page integer default 0) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' then raise exception 'forbidden' using errcode='42501'; end if;
 return private.vne_intake_list(_status,_page);
end $$;
create function public.vne_intake_read(_request uuid) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' then raise exception 'forbidden' using errcode='42501'; end if;
 return private.vne_intake_read(_request);
end $$;
create function public.vne_intake_review(_command jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'authenticated' then raise exception 'forbidden' using errcode='42501'; end if;
 return private.vne_intake_review(_command);
end $$;
revoke all on function public.vne_intake_list(text,integer) from PUBLIC,anon,authenticated,service_role;
revoke all on function public.vne_intake_read(uuid) from PUBLIC,anon,authenticated,service_role;
revoke all on function public.vne_intake_review(jsonb) from PUBLIC,anon,authenticated,service_role;
grant execute on function public.vne_intake_list(text,integer) to authenticated;
grant execute on function public.vne_intake_read(uuid) to authenticated;
grant execute on function public.vne_intake_review(jsonb) to authenticated;
commit;
