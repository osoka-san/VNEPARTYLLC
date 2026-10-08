-- CLOSED PROPOSAL, NOT APPLIED. Narrow incident/R2 session hardening only.
-- Does not replace shared staff_session_ok, QR guards, roles or Auth state.
begin;
set local search_path='';
set local lock_timeout='3s';
do $preflight$
begin
 if current_user<>'postgres' or to_regprocedure('private.is_admitted(uuid)') is null
    or to_regclass('auth.sessions') is null or to_regclass('auth.mfa_factors') is null
    or to_regprocedure('private.vne_incident_session_ok()') is not null then
   raise exception 'incident_live_session_prerequisite_drift';
 end if;
end $preflight$;
create function private.vne_incident_session_ok() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.uid() is not null
   and auth.jwt()->>'role'='authenticated'
   and auth.jwt()->>'aal'='aal2'
   and coalesce((auth.jwt()->>'is_anonymous')::boolean,false)=false
   and private.is_admitted(auth.uid())
   and exists(
     select 1 from auth.users u
     join auth.sessions s on s.user_id=u.id
     join auth.mfa_factors f on f.id=s.factor_id and f.user_id=u.id
     where u.id=auth.uid()
       and u.is_anonymous is false and u.email_confirmed_at is not null
       and (u.banned_until is null or u.banned_until<=now())
       and s.id=nullif(auth.jwt()->>'session_id','')::uuid
       and s.aal::text='aal2'
       and (s.not_after is null or s.not_after>now())
       and f.status::text='verified'
   ), false);
$$;
revoke all on function private.vne_incident_session_ok() from PUBLIC,anon,authenticated,service_role;
commit;
