-- Owner-approved daily expiry cleanup, separate from draft storage/API activation.
-- TEST only. Never run an immediate cleanup from this migration.
begin;
set local search_path='';
set local lock_timeout='3s';
do $$
begin
 if current_user<>'postgres' or current_user is distinct from
  (select pg_get_userbyid(relowner) from pg_class where oid='private.questionnaire_drafts'::regclass)
 or exists(select 1 from pg_extension where extname='pg_cron') then
  raise exception 'draft_daily_purge_preflight_drift';
 end if;
 if coalesce(current_setting('cron.timezone',true),'GMT') not in ('GMT','UTC','Etc/UTC') then
  raise exception 'draft_daily_purge_timezone_mismatch';
 end if;
end $$;
-- Official Supabase-provided extension, already preloaded; no credentials or networking.
create extension pg_cron with schema pg_catalog;
-- This fresh extension must not introduce API-role access to scheduling or job metadata.
revoke all on schema cron from PUBLIC,anon,authenticated,service_role;
revoke all on all tables in schema cron from PUBLIC,anon,authenticated,service_role;
revoke all on all sequences in schema cron from PUBLIC,anon,authenticated,service_role;
revoke all on all functions in schema cron from PUBLIC,anon,authenticated,service_role;

create function private.purge_expired_questionnaire_drafts(_limit integer default 1000) returns integer
language plpgsql security invoker set search_path='' set lock_timeout='3s' set statement_timeout='30s' as $$
declare deleted integer;
begin
 if _limit is null or _limit<1 or _limit>10000 then raise exception 'invalid_batch'; end if;
 with expired as (
  select owner_user_id,id from private.questionnaire_drafts
  where expires_at<=pg_catalog.statement_timestamp()
  order by expires_at,owner_user_id,id limit _limit for update skip locked
 )
 delete from private.questionnaire_drafts d using expired e
 where d.owner_user_id=e.owner_user_id and d.id=e.id;
 get diagnostics deleted=row_count;
 return deleted;
end $$;
revoke all on function private.purge_expired_questionnaire_drafts(integer) from PUBLIC,anon,authenticated,service_role;

do $$
begin
 if exists(select 1 from cron.job where jobname='vne-questionnaire-drafts-expiry-daily') then
  raise exception 'draft_daily_purge_job_exists';
 end if;
end $$;
select cron.schedule('vne-questionnaire-drafts-expiry-daily','0 3 * * *',
 'SELECT private.purge_expired_questionnaire_drafts(1000);');
commit;
