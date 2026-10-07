// Research-only disposable PostgreSQL VM. No network / shared DB / Sites actions.
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID,randomBytes,createHash } from 'node:crypto';
const hash=value=>createHash('sha256').update(value).digest('hex');
const root = new URL('../../supabase/migrations/',import.meta.url).pathname;
const db = new PGlite();
const read = (name) => readFile(root + name, 'utf8');
const apply = async (name, text) => { await db.exec(text); console.log('PASS ' + name); };
try {
 await apply('Supabase auth plumbing and digest subset', `
 create role anon nologin;
 create role authenticated nologin;
 create role service_role nologin bypassrls;
 create schema auth;
 create schema extensions;
 grant usage on schema auth to anon,authenticated,service_role;
 create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
 create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id), not_after timestamptz);
 create function auth.jwt() returns jsonb language sql stable as
 $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as
 $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 create function auth.role() returns text language sql stable as
 $$select coalesce(auth.jwt()->>'role','anon')$$;
 -- Exact SHA-256 bytes, not a fake digest. This harness supports only the one
 -- digest(text,'sha256') overload used by the real refund RPC.
 create function extensions.digest(data text,algorithm text) returns bytea
 language plpgsql immutable strict as $$begin
  if algorithm<>'sha256' then raise exception 'unsupported test digest'; end if;
  return pg_catalog.sha256(pg_catalog.convert_to(data,'UTF8'));
 end$$;
 `);
 await apply('real initial auth/domain migration', await read('20260925151336_22c550e1-3671-44e9-89fb-d6beac5a3081.sql'));
 const admission = await read('20260925232007_93a1b6be-1a99-40bb-8269-c6b55fcba99e.sql');
 await apply('real admission type/table/helper excerpt', admission.slice(0, admission.indexOf('create or replace function private.require_admitted()')));
 const guardStart = admission.indexOf('create or replace function private.staff_session_ok()');
 const guardEnd = admission.indexOf('\n$$;', guardStart)+4;
 await apply('real current staff session guard excerpt', admission.slice(guardStart, guardEnd));
 await apply('real held outbox constraint excerpt', `alter table private.outbox drop constraint outbox_status_check;alter table private.outbox add constraint outbox_status_check check(status in ('pending','sent','failed','held'));`);
 await apply('real finance enum migration', await read('20260926044903_c7cc8d02-b43b-42a9-ba1b-645791ad91ff.sql'));
 await apply('real commerce migration', await read('20260926045051_1c47aaac-1ad9-421e-9123-655293624e2a.sql'));
 await apply('real commerce correction migration', await read('20260926050248_2994d286-e9cf-43b3-8358-e48d6e083ec9.sql'));
 await apply('current ticket issuer migration', await read('20261005132540_ticket_issuer.sql'));
 const checks = await db.query(`select
 has_function_privilege('anon','public.ticket_read(text)','execute') as anon_read,
 not has_function_privilege('anon','public.ticket_scan(jsonb)','execute') as anon_scan_denied,
 not has_function_privilege('authenticated','private.ticket_dto(uuid)','execute') as helper_denied,
 has_function_privilege('service_role','public.apply_payment_event(text,text,text,text,uuid,text,bigint,text,timestamptz)','execute') as webhook_allowed,
 not has_function_privilege('authenticated','public.apply_payment_event(text,text,text,text,uuid,text,bigint,text,timestamptz)','execute') as webhook_guest_denied,
 encode(extensions.digest('hello','sha256'),'hex')='2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824' as real_sha256`);
 if (!Object.values(checks.rows[0]).every(Boolean)) throw new Error(JSON.stringify(checks.rows));
 console.log('PASS ACL and real SHA-256 probe ' + JSON.stringify(checks.rows[0]));
// Exercise real PostgreSQL roles and real ticket/commerce functions. All data is synthetic.
const passResults = [];
let count = 0;
const check = async (name, fn) => { await fn(); count++; console.log('PASS lifecycle ' + name); };
const identities = Object.fromEntries(['owner','guest','scanner'].map(name => [name,{id:randomUUID(),session:randomUUID(),role:'authenticated',aal:'aal2'}]));
identities.anon = {role:'anon'};
identities.service = {role:'service_role'};
const withIdentity = async (who, fn) => {
 const identity = typeof who === 'string' ? identities[who] : who;
 return db.transaction(async tx => {
  await tx.exec(`set local role ${identity.role}`);
  await tx.query(`select set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:identity.id,session_id:identity.session,role:identity.role,aal:identity.aal})]);
  return fn(tx);
 });
};
const expectFailure = async (fn, expected) => {
 let caught = false;
 try { await fn(); } catch(error) { caught = true; assert.ok(String(error.message).includes(expected) || error.code === expected, `Expected ${expected}; received ${error.code}: ${error.message}`); }
 assert.ok(caught, 'Expected failure ' + expected);
};
for (const [name,who] of Object.entries(identities).filter(([,v])=>v.id)) {
 await db.query(`insert into auth.users(id,email) values($1,$2)`,[who.id,`${name}@synthetic.invalid`]);
 await db.query(`insert into auth.sessions(id,user_id,not_after) values($1,$2,clock_timestamp()+interval '1 day')`,[who.session,who.id]);
 await db.query(`insert into private.member_admission(user_id,state,source) values($1,'admitted','synthetic')`,[who.id]);
}
await db.query(`insert into public.staff_assignments(user_id,role) values($1,'owner')`,[identities.owner.id]);
const event = async ({capacity=3, synthetic=false, future=false}={}) => {
 const id=randomUUID();
 await db.query(`insert into public.events(id,slug,title,status,starts_at,capacity,is_synthetic,qr_release_at,entry_opens_at,entry_closes_at)
 values($1,$2,'SYNTHETIC TEST','published',clock_timestamp()+interval '10 minutes',$3,$4,
 clock_timestamp()+case when $5 then interval '20 minutes' else interval '-2 minutes' end,
 clock_timestamp()+case when $5 then interval '25 minutes' else interval '-1 minute' end,
 clock_timestamp()+interval '1 hour')`,[id,'synthetic-'+id,capacity,synthetic,future]);
 return id;
};
const e1=await event({capacity:2});
const eOther=await event();
const eFuture=await event({future:true});
const eSandbox=await event({synthetic:true});
await db.query(`insert into public.staff_assignments(user_id,role,event_id) values($1,'scanner',$2)`,[identities.scanner.id,e1]);
const makeIssue = (eventId, extra={}) => ({
 id:randomUUID(),operation:randomUUID(),view:randomBytes(32).toString('base64url'),scan:randomBytes(32).toString('base64url'),
 input:{eventId,name:'SYNTHETIC GUEST',access:'GENERAL',reason:'Synthetic manual invitation',...extra}
});
const issueTx = async (tx, spec) => (await tx.query(`select public.ticket_issue($1::jsonb,$2,$3,$4,'test-v1',$5) as result`,[JSON.stringify(spec.input),spec.id,hash(spec.view),hash(spec.scan),spec.operation])).rows[0].result;
const issue = (spec,who='owner') => withIdentity(who,tx=>issueTx(tx,spec));
const admin = (action,input,who='owner') => withIdentity(who,async tx=>(await tx.query(`select public.ticket_admin($1,$2::jsonb) as result`,[action,JSON.stringify(input)])).rows[0].result);
const readPass = (token,who='anon') => withIdentity(who,async tx=>(await tx.query(`select public.ticket_read($1) as result`,[token])).rows[0].result);
const scan = (spec,{eventId=spec.input.eventId,consume=false,version=1,operation=randomUUID(),who='owner'}={}) => withIdentity(who,async tx=>(await tx.query(`select public.ticket_scan($1::jsonb) as result`,[JSON.stringify({eventId,token:spec.scan,consume,expectedVersion:version,operationId:operation})])).rows[0].result);
const taken = async eid=>(await db.query(`select private.seats_taken($1) as n`,[eid])).rows[0].n;
const a=makeIssue(e1),b=makeIssue(e1),c=makeIssue(e1);
await check('manual issuance inherits live event and consumes one seat',async()=>{const r=await issue(a);assert.equal(r.pass.source,'manual');assert.equal(r.pass.environment,'live');assert.equal(r.pass.sequenceNumber,1);assert.equal(await taken(e1),1);});
await check('same operation retry returns same pass and no extra seat',async()=>{const r=await issue(a);assert.equal(r.duplicate,true);assert.equal(r.pass.id,a.id);assert.equal(await taken(e1),1);});
await check('same operation with changed payload is rejected',async()=>expectFailure(()=>issue({...a,input:{...a.input,name:'CHANGED'}}),'idempotency_conflict'));
await check('second manual issue consumes last slot',async()=>{assert.equal((await issue(b)).pass.sequenceNumber,2);assert.equal(await taken(e1),2);});
await check('capacity blocks next issuance',async()=>expectFailure(()=>issue(c),'event_capacity_reached'));
await check('guest cannot issue even with aal2',async()=>expectFailure(()=>issue(makeIssue(eOther),'guest'),'42501'));
await check('owner aal1 cannot issue',async()=>expectFailure(()=>issue(makeIssue(eOther),{...identities.owner,aal:'aal1'}),'42501'));
await check('anon can read correct view-token through capability wrapper',async()=>{const r=await readPass(a.view);assert.equal(r.id,a.id);assert.equal(r.qrEligible,true);});
await check('scan-token does not grant view access',async()=>assert.equal(await readPass(a.scan),null));
await check('bad view-token returns null',async()=>{assert.equal(await readPass('x'),null);assert.equal(await readPass(randomBytes(32).toString('base64url')),null);});
await check('anon cannot read private table, dto helper or call admin',async()=>{
 await expectFailure(()=>withIdentity('anon',tx=>tx.query(`select * from private.ticket_passes`)),'42501');
 await expectFailure(()=>withIdentity('anon',tx=>tx.query(`select private.ticket_dto($1)`,[a.id])),'42501');
 await expectFailure(()=>admin('get',{id:a.id},'anon'),'42501');
});
await check('stale revoke version is rejected',async()=>expectFailure(()=>admin('revoke',{id:a.id,reason:'Synthetic revoke',expectedVersion:2,operationId:randomUUID()}),'version_conflict'));
const revokeOp={id:a.id,reason:'Synthetic revoke',expectedVersion:1,operationId:randomUUID()};
await check('revoke frees manual slot and revokes bearer read',async()=>{const r=await admin('revoke',revokeOp);assert.equal(r.pass.status,'revoked');assert.equal(await taken(e1),1);assert.equal((await readPass(a.view)).status,'revoked');});
await check('revoke retry is idempotent',async()=>{assert.equal((await admin('revoke',revokeOp)).duplicate,true);assert.equal(await taken(e1),1);});
await check('reissued capacity never reuses sequence number',async()=>{assert.equal((await issue(c)).pass.sequenceNumber,3);assert.equal(await taken(e1),2);});
await check('revoked scan rejected',async()=>assert.equal((await scan(a)).outcome,'revoked'));
await check('scoped scanner can verify assigned event without consuming',async()=>{assert.equal((await scan(b,{who:'scanner'})).outcome,'ready');assert.equal((await readPass(b.view)).status,'active');});
await check('scanner is refused for different event',async()=>expectFailure(()=>scan(b,{who:'scanner',eventId:eOther}),'42501'));
await check('wrong-event token never matches',async()=>assert.equal((await scan(b,{eventId:eOther})).outcome,'not_found'));
await check('stale checkin version does not consume pass',async()=>{assert.equal((await scan(b,{consume:true,version:2})).outcome,'version_conflict');assert.equal((await readPass(b.view)).status,'active');});
const consumeOp=randomUUID();
await check('first checkin is accepted',async()=>{assert.equal((await scan(b,{consume:true,operation:consumeOp,who:'scanner'})).outcome,'accepted');assert.equal((await readPass(b.view)).status,'used');});
await check('same checkin operation returns existing receipt',async()=>{const r=await scan(b,{consume:true,operation:consumeOp,who:'scanner'});assert.equal(r.outcome,'accepted');assert.equal(r.replayed,true);});
await check('second distinct scan cannot admit again',async()=>{assert.equal((await scan(b,{consume:true,who:'scanner'})).outcome,'used');const n=(await db.query(`select count(*)::int as n from private.ticket_checkins where pass_id=$1`,[b.id])).rows[0].n;assert.equal(n,1);});
await check('used manual pass retains its seat and cannot be revoked',async()=>{assert.equal(await taken(e1),2);await expectFailure(()=>admin('revoke',{id:b.id,reason:'Synthetic revoke',expectedVersion:2,operationId:randomUUID()}),'already_used');});
const future=makeIssue(eFuture);
await check('future QR release hides eligibility and blocks scan',async()=>{await issue(future);assert.equal((await readPass(future.view)).qrEligible,false);assert.equal((await scan(future)).outcome,'too_early');});
const sandbox=makeIssue(eSandbox);
await check('synthetic event creates sandbox pass and cannot be admitted',async()=>{assert.equal((await issue(sandbox)).pass.demo,true);assert.equal((await scan(sandbox,{consume:true})).outcome,'sandbox');});
await check('actual time expiry is enforced without cron',async()=>{await db.query(`update private.ticket_passes set valid_until=clock_timestamp()-interval '1 second' where id=$1`,[c.id]);assert.equal((await readPass(c.view)).status,'expired');assert.equal((await scan(c)).outcome,'expired');});
await check('event cancellation immediately invalidates active pass',async()=>{await db.query(`update public.events set cancelled_at=clock_timestamp() where id=$1`,[eFuture]);assert.equal((await readPass(future.view)).status,'revoked');assert.equal((await scan(future)).outcome,'event_unavailable');});
const commerce = async ({environment='live',eventId=null}={}) => {
 const eid=eventId??await event({capacity:2});
 const uid=identities.guest.id,tier=randomUUID(),application=randomUUID(),reservation=randomUUID(),order=randomUUID();
 await db.query(`insert into public.event_tiers(id,event_id,name,amount_minor,currency) values($1,$2,'SYNTHETIC',1000,'RUB')`,[tier,eid]);
 await db.query(`insert into public.applications(id,event_id,user_id,status) values($1,$2,$3,'approved')`,[application,eid,uid]);
 await db.query(`insert into public.reservations(id,event_id,tier_id,user_id,application_id,expires_at,idempotency_key) values($1,$2,$3,$4,$5,clock_timestamp()+interval '15 minutes',$6)`,[reservation,eid,tier,uid,application,randomUUID()]);
 await db.query(`insert into public.orders(id,reservation_id,user_id,event_id,tier_id,tier_name,amount_minor,currency,environment) values($1,$2,$3,$4,$5,'SYNTHETIC',1000,'RUB',$6)`,[order,reservation,uid,eid,tier,environment]);
 return {eid,uid,tier,application,reservation,order,environment,paymentId:randomUUID()};
};
const payTx = async (tx,f,eventId=randomUUID())=>(await tx.query(`select public.apply_payment_event('synthetic',$1,$2,$3,$4,'succeeded',1000,'RUB',clock_timestamp()) as result`,[f.environment,eventId,f.paymentId,f.order])).rows[0].result;
const pay = (f,eventId)=>withIdentity('service',tx=>payTx(tx,f,eventId));
const paid=await commerce();
let pId,pSpec;
await check('real payment reconciliation creates paid active participation',async()=>{assert.equal(await pay(paid),'paid');pId=(await db.query(`select id from public.participations where order_id=$1`,[paid.order])).rows[0].id;assert.equal(await taken(paid.eid),1);});
await check('participation pass uses existing seat without double counting',async()=>{pSpec=makeIssue(paid.eid,{participationId:pId});const r=await issue(pSpec);assert.equal(r.pass.source,'participation');assert.equal(r.pass.userId,paid.uid);assert.equal(await taken(paid.eid),1);});
await check('a second pass for same participation is rejected',async()=>expectFailure(()=>issue(makeIssue(paid.eid,{participationId:pId})),'ticket_exists'));
await check('paid order review status immediately removes QR eligibility',async()=>{await db.query(`update public.orders set status='needs_review' where id=$1`,[paid.order]);assert.equal((await readPass(pSpec.view)).status,'revoked');assert.equal((await scan(pSpec)).outcome,'revoked');await db.query(`update public.orders set status='paid' where id=$1`,[paid.order]);});
await check('revoked participation immediately removes QR eligibility',async()=>{await db.query(`update public.participations set status='revoked' where id=$1`,[pId]);assert.equal((await readPass(pSpec.view)).status,'revoked');assert.equal((await scan(pSpec)).outcome,'revoked');await db.query(`update public.participations set status='active' where id=$1`,[pId]);});
await check('used participation keeps seat after canonical refund transition',async()=>{assert.equal((await scan(pSpec,{consume:true})).outcome,'accepted');await db.query(`update public.participations set status='refunded' where id=$1`,[pId]);await db.query(`update public.orders set status='refunded' where id=$1`,[paid.order]);assert.equal(await taken(paid.eid),1);});
const sandboxPaid=await commerce({environment:'sandbox'});
let sandboxPaidSpec;
await check('sandbox payment never becomes live pass',async()=>{assert.equal(await pay(sandboxPaid),'paid');const id=(await db.query(`select id from public.participations where order_id=$1`,[sandboxPaid.order])).rows[0].id;sandboxPaidSpec=makeIssue(sandboxPaid.eid,{participationId:id});assert.equal((await issue(sandboxPaidSpec)).pass.environment,'sandbox');assert.equal((await scan(sandboxPaidSpec,{consume:true})).outcome,'sandbox');});
await check('real full sandbox refund invalidates unconsumed pass',async()=>{await withIdentity('owner',tx=>tx.query(`select public.refund_sandbox($1,1000,$2)`,[sandboxPaid.order,randomUUID()]));assert.equal((await readPass(sandboxPaidSpec.view)).status,'revoked');assert.equal(await taken(sandboxPaid.eid),0);});
const late=await commerce();
await check('expiry checks real clock despite older transaction timestamp',async()=>{
 const result=await withIdentity('service',async tx=>{
  await tx.query(`update public.reservations set expires_at=clock_timestamp()+interval '20 milliseconds' where id=$1`,[late.reservation]);
  await new Promise(resolve=>setTimeout(resolve,60));
  return payTx(tx,late);
 });
 assert.equal(result,'needs_review');
 assert.equal((await db.query(`select count(*)::int as n from public.participations where order_id=$1`,[late.order])).rows[0].n,0);
});
await check('staff session revocation blocks next mutation',async()=>{await db.query(`delete from auth.sessions where id=$1`,[identities.owner.session]);await expectFailure(()=>issue(makeIssue(eOther)),'42501');});
console.log(JSON.stringify({lifecycleTests:count,result:'PASS',concurrency:'NOT VERIFIED: PGlite is single connection',auth:'real PostgreSQL roles + synthetic claims/session fixture; not live Supabase login'}));

} finally { await db.close(); }
