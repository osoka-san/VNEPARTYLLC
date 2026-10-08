-- OFFLINE PGLITE FIXTURE ONLY. Do not apply remotely; live body already matches.
CREATE OR REPLACE FUNCTION private.qr_require_actor()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare u uuid:=auth.uid(); sid uuid;
begin
 if u is null or exists(select 1 from auth.users demo_user where demo_user.id=u
   and demo_user.raw_app_meta_data->>'demo_only'='true')
 or coalesce(auth.jwt()->>'is_anonymous','false')='true' then raise exception 'forbidden' using errcode='42501'; end if;
 sid:=nullif(auth.jwt()->>'session_id','')::uuid;
 perform 1 from auth.sessions s where s.id=sid and s.user_id=u and (s.not_after is null or s.not_after>clock_timestamp()) for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 perform 1 from private.member_admission a where a.user_id=u and a.state in ('admitted','exempt') for share;
 if not found then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from private.qr_admission_config where singleton and enabled and synthetic_admission and project_ref='xrocuwlofxhxoxajukne') then raise exception 'not_configured' using errcode='55000'; end if;
 return u;
end $function$;
