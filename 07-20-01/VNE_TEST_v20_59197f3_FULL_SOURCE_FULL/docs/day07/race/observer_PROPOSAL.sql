-- NEW LOCAL RECOVERY PROPOSAL. NOT AUTHORIZED TO RUN.
-- One native transaction; public run metadata only. No business-table writes or JWT/QR/query-text output.
-- Materialize transaction-local approval_ref, race_start_utc, phase, op_a/op_b after exact owner approval.
begin;
set local search_path='';
set local statement_timeout='20s';
set local lock_timeout='100ms';
do $prewait$
declare target timestamptz:=nullif(current_setting('vne.day07.race_start_utc',true),'')::timestamptz;phase text:=current_setting('vne.day07.phase',true);
begin
 if nullif(current_setting('vne.day07.approval_ref',true),'') is null then raise exception 'explicit_observer_approval_required';end if;
 if target is null or target<clock_timestamp()+interval '0.5 second' or target>clock_timestamp()+interval '15 seconds' then raise exception 'invalid_or_missed_target';end if;
 if phase is null or phase not in ('verify','checkin') then raise exception 'invalid_phase';end if;
 if not exists(select 1 from private.qr_admission_config where singleton and enabled and synthetic_admission and project_ref='xrocuwlofxhxoxajukne') then raise exception 'active_exact_TEST_required';end if;
 if not exists(select 1 from public.events where id='d0700000-0000-4000-8000-000000000001' and is_synthetic and status='published' and cancelled_at is null and qr_release_at<=target-interval '0.4 second' and entry_closes_at=qr_release_at+interval '20 minutes' and target+interval '2 seconds'<entry_closes_at and (phase='verify' or entry_opens_at<=target)) then raise exception 'approved_fixture_window_required';end if;
 if phase='checkin' and (nullif(current_setting('vne.day07.op_a',true),'') is null or nullif(current_setting('vne.day07.op_b',true),'') is null or current_setting('vne.day07.op_a')::uuid=current_setting('vne.day07.op_b')::uuid) then raise exception 'two_distinct_operations_required';end if;
 -- This prewait holds NO event row lock. A late connector start must fail, not move the target.
 while clock_timestamp()<target-interval '0.4 second' loop perform pg_sleep(0.01);end loop;
end $prewait$;
set local statement_timeout='1800ms';
do $observe$
declare
 target timestamptz:=current_setting('vne.day07.race_start_utc')::timestamptz;
 phase text:=current_setting('vne.day07.phase');controller integer:=pg_backend_pid();
 attempted timestamptz;acquired timestamptz;observed timestamptz;released timestamptz;deadline timestamptz;
 status text:='NOT_VERIFIED_NO_OVERLAP';backends jsonb:='[]'::jsonb;found_backends jsonb;polls integer:=0;held_ms numeric;
begin
 begin
  if clock_timestamp()>target then raise exception 'target_missed' using errcode='P0001';end if;
  attempted:=clock_timestamp();
  perform 1 from public.events where id='d0700000-0000-4000-8000-000000000001' for update nowait;
  if not found then raise exception 'fixture_missing';end if;
  acquired:=clock_timestamp();deadline:=attempted+interval '1500 milliseconds';
  while clock_timestamp()<deadline loop
   polls:=polls+1;
   -- PostgreSQL activity snapshots are transaction-cached; refresh before every observation.
   perform pg_stat_clear_snapshot();
   if phase='checkin' then
    with desired(actor,operation) as(values
      ('1e7259c2-ad13-43a1-b34b-cba71533e844'::uuid,current_setting('vne.day07.op_a')::uuid),
      ('ed2433cb-bc6e-4b23-aa57-000839292ec4'::uuid,current_setting('vne.day07.op_b')::uuid)),
    keys as(select actor,operation,hashtextextended('vne.qr.v2:'||actor::text||operation::text,0) k from desired),
    mapped as(select d.actor,d.operation,s.pid,s.backend_start,s.xact_start,s.query_start,s.state,s.wait_event_type,s.wait_event,pg_blocking_pids(s.pid) blockers
     from keys d join pg_locks l on l.locktype='advisory' and l.granted and l.objsubid=1
      and l.classid=((d.k>>32)&4294967295)::oid and l.objid=(d.k&4294967295)::oid
     join pg_stat_activity s on s.pid=l.pid
     where s.pid<>controller and s.backend_type='client backend' and s.state='active' and s.wait_event_type='Lock'
      and exists(with recursive chain(pid,path) as(select s.pid,array[s.pid] union all select blocker,c.path||blocker from chain c cross join lateral unnest(pg_blocking_pids(c.pid)) blocker where not blocker=any(c.path) and cardinality(c.path)<8) select 1 from chain where pid=controller))
    select coalesce(jsonb_agg(jsonb_build_object('actorId',actor,'operationId',operation,'pid',pid,'backendStart',backend_start,'transactionStart',xact_start,'queryStart',query_start,'state',state,'waitType',wait_event_type,'waitEvent',wait_event,'blockingPids',blockers) order by actor),'[]'::jsonb) into found_backends from mapped;
   else
    select coalesce(jsonb_agg(jsonb_build_object('pid',s.pid,'backendStart',s.backend_start,'transactionStart',s.xact_start,'queryStart',s.query_start,'state',s.state,'waitType',s.wait_event_type,'waitEvent',s.wait_event,'blockingPids',pg_blocking_pids(s.pid)) order by s.pid),'[]'::jsonb) into found_backends
    from pg_stat_activity s where s.pid<>controller and s.backend_type='client backend' and s.state='active' and s.wait_event_type='Lock'
     and exists(with recursive chain(pid,path) as(select s.pid,array[s.pid] union all select blocker,c.path||blocker from chain c cross join lateral unnest(pg_blocking_pids(c.pid)) blocker where not blocker=any(c.path) and cardinality(c.path)<8) select 1 from chain where pid=controller);
   end if;
   if jsonb_array_length(found_backends)=2 and (select count(distinct value->>'pid') from jsonb_array_elements(found_backends))=2 then
    backends:=found_backends;observed:=clock_timestamp();status:=case when phase='checkin' then 'TWO_OPERATION_BOUND_BACKENDS_OBSERVED' else 'REHEARSAL_TWO_BACKENDS_OBSERVED_NOT_ACTOR_ATTRIBUTED' end;exit;
   end if;
   perform pg_sleep(0.01);
  end loop;
  -- Deliberate subtransaction rollback releases the event row lock BEFORE formatting evidence.
  raise exception 'release_barrier' using errcode='P0002';
 exception
  when no_data_found then null;
  when lock_not_available then status:='NOT_VERIFIED_FIXTURE_BUSY';
  when query_canceled then status:='TIMEOUT_UNCERTAIN';
  when others then status:='NOT_VERIFIED_OBSERVER_ERROR';
 end;
 released:=clock_timestamp();held_ms:=case when acquired is null then 0 else extract(epoch from released-attempted)*1000 end;
 if held_ms>2000 then status:='FAIL_LOCK_BOUND';end if;
 perform set_config('vne.day07.observer_result',jsonb_build_object('status',status,'phase',phase,'eventId','d0700000-0000-4000-8000-000000000001','observerPid',controller,'startAt',target,'lockAttemptAt',attempted,'lockAcquiredAt',acquired,'observedAt',observed,'lockReleasedAt',released,'heldMs',held_ms,'polls',polls,'backends',backends)::text,true);
end $observe$;
select current_setting('vne.day07.observer_result')::jsonb as evidence;
commit;
