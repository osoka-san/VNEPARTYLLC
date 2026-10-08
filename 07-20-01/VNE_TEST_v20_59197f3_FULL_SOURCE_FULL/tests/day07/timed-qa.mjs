/** Scheduler simulation, not actual browser timing, Auth, or PostgreSQL concurrency. */
import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {randomUUID} from 'node:crypto';
const dir=await mkdtemp(join(tmpdir(),'day07-timed-'));const built=await build({entryPoints:['src/lib/admission/timed-qa-core.ts'],bundle:true,platform:'node',format:'esm',write:false});await writeFile(join(dir,'core.mjs'),built.outputFiles[0].text);const {TimedQaSession,QA_ACTORS,QA_EVENT,QA_PART,QA_PASS,QA_PUBLIC_TOKEN,pageQaBudget}=await import(pathToFileURL(join(dir,'core.mjs')));
const flush=async()=>{for(let i=0;i<60;i++)await Promise.resolve();};
const wireReceipt=({replayed,...receipt})=>receipt;
function harness({actor=QA_ACTORS[0],latency=10,mfa=true,command}={}){
 let wall=Date.parse('2026-10-08T12:00:00.000Z'),mono=0,seq=0;const timers=new Map();const calls=[];let visible=true,online=true;
 const port={wall:()=>wall,mono:()=>mono,visible:()=>visible,online:()=>online,timeout:(fn,ms)=>{const id=++seq;timers.set(id,{fn,at:mono+ms,interval:0});return id;},clearTimeout:id=>timers.delete(id),interval:(fn,ms)=>{const id=++seq;timers.set(id,{fn,at:mono+ms,interval:ms});return id;},clearInterval:id=>timers.delete(id),mfa:async()=>mfa?({ok:true,userId:actor,aal2:true,hasVerifiedTotp:true}):({ok:false,reason:'forbidden'}),command:async c=>{calls.push(c);if(command)return command(c,h);wall+=latency;mono+=latency;const isReady=c.action==='verify'&&c.token===QA_PUBLIC_TOKEN;return {ok:true,events:[],qrText:null,secretUnavailable:true,replayed:false,receipt:{operationId:c.action==='checkin'?c.operationId:null,correlationId:randomUUID(),action:c.action,outcome:c.action==='checkin'?'simulated_accepted':isReady?'ready':'invalid_token',eventId:QA_EVENT,participationId:c.action==='checkin'||isReady?QA_PART:null,passId:c.action==='checkin'||isReady?QA_PASS:null,version:c.action==='checkin'?2:isReady?1:null,generation:c.action==='checkin'||isReady?1:null,actorId:actor,at:new Date(wall).toISOString(),simulated:true,reentryAllowed:false}};}};
 const budget={used:0,invalidated:false};const session=new TimedQaSession(port,budget);const config={runId:randomUUID(),actorId:actor,windowStart:new Date(wall-60000).toISOString()};
 const h={session,port,budget,calls,config,timers,setVisible:x=>visible=x,setOnline:x=>online=x,stepWall:ms=>wall+=ms,stall:ms=>{wall+=ms;mono+=ms;},mono:()=>mono,wall:()=>wall,
  advance:async(ms,{throttle=false}={})=>{if(throttle){wall+=ms;mono+=ms;for(const [id,t]of [...timers])if(t.at<=mono){if(t.interval)t.at=mono+t.interval;else timers.delete(id);t.fn();}await flush();return;}const end=mono+ms;while(true){let next=[...timers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const[id,t]=next;const delta=Math.max(0,t.at-mono);wall+=delta;mono+=delta;if(t.interval)t.at+=t.interval;else timers.delete(id);t.fn();await flush();}const delta=Math.max(0,end-mono);wall+=delta;mono+=delta;await flush();}};
 return h;
}
function validRehearsal(h){const s=h.session.snapshot(),at=Date.parse(s.receipt.at),dispatch=Date.parse(s.dispatchAt),observed=Math.min(at,dispatch+2),lockStart=observed-100,released=observed+1;const other={...s.receipt,actorId:QA_ACTORS.find(x=>x!==s.actorId),correlationId:randomUUID(),at:new Date(Math.max(at,released)).toISOString()};const browsers=QA_ACTORS.map(actor=>({dispatchedAt:s.dispatchAt,uncertaintyMs:s.uncertaintyMs,receipt:actor===s.actorId?{...s.receipt}:other}));return {schema:'day07-rehearsal-v2',runId:s.runId,windowStart:s.windowStart,rehearsalTarget:s.rehearsalTarget,coordinatorVerdict:'REHEARSAL_RECONCILED',reconciledAt:new Date(Math.max(at,released)+2).toISOString(),observer:{status:'REHEARSAL_TWO_BACKENDS_OBSERVED_NOT_ACTOR_ATTRIBUTED',phase:'verify',eventId:QA_EVENT,observerPid:99,startAt:s.rehearsalTarget,lockAttemptAt:new Date(lockStart).toISOString(),lockAcquiredAt:new Date(lockStart+1).toISOString(),observedAt:new Date(observed).toISOString(),lockReleasedAt:new Date(released).toISOString(),heldMs:released-lockStart,polls:2,backends:[1,2].map(pid=>({pid,backendStart:new Date(lockStart-10000).toISOString(),transactionStart:new Date(lockStart-1000).toISOString(),queryStart:new Date(lockStart-1).toISOString(),state:'active',waitType:'Lock',waitEvent:'transactionid',blockingPids:[99]}))},browsers};}
async function rehearsal(h){await h.session.calibrate(h.config);assert.equal(h.session.snapshot().phase,'calibrated');h.session.armRehearsal(new Date(h.wall()+h.session.snapshot().offsetMs+1000).toISOString());await h.advance(1050);assert.equal(h.session.snapshot().phase,'rehearsal_done');}
async function ready(h){await rehearsal(h);h.session.acceptRehearsal(validRehearsal(h));await h.session.calibrate(h.config);assert.equal(h.session.snapshot().phase,'recalibrated');await h.session.verifyReady();assert.equal(h.session.snapshot().phase,'ready');}
await test('constructor/subscription are inert; explicit calibration is exactly three bounded probes',async()=>{const h=harness();let updates=0;h.session.subscribe(()=>updates++);assert.equal(h.calls.length,0);assert.equal(h.timers.size,0);await h.session.calibrate(h.config);assert.equal(h.calls.length,3);assert.equal(h.session.snapshot().phase,'calibrated');assert.ok(updates>0);assert.equal(h.timers.size,0);});
await test('missing MFA and wrong actor stop before completion',async()=>{const a=harness({mfa:false});await a.session.calibrate(a.config);assert.equal(a.calls.length,0);assert.equal(a.session.snapshot().phase,'cancelled');const b=harness({actor:QA_ACTORS[1]});await b.session.calibrate({...b.config,actorId:QA_ACTORS[0]});assert.equal(b.calls.length,0);assert.equal(b.session.snapshot().phase,'cancelled');assert.equal(b.session.snapshot().message,'session_wrong_account');});
await test('RTT and wall-clock step fail closed',async()=>{const h=harness({latency:1501});await h.session.calibrate(h.config);assert.equal(h.calls.length,3);assert.equal(h.session.snapshot().phase,'cancelled');assert.equal(h.session.snapshot().message,'insufficient_good_samples');const x=harness();await x.session.calibrate(x.config);x.stepWall(30);assert.throws(()=>x.session.armRehearsal(new Date(x.wall()+1000).toISOString()),/clock_step/);});
await test('rehearsal must be explicitly armed and rapid second arm cannot send twice',async()=>{const h=harness();await h.session.calibrate(h.config);const target=new Date(h.wall()+1000).toISOString();h.session.armRehearsal(target);assert.throws(()=>h.session.armRehearsal(target));await h.advance(1100);assert.equal(h.calls.length,4);assert.equal(h.session.snapshot().phase,'rehearsal_done');});
await test('hidden, offline and throttled timer cancel before dispatch',async()=>{for(const kind of ['hidden','offline','throttle']){const h=harness();await h.session.calibrate(h.config);h.session.armRehearsal(new Date(h.wall()+1000).toISOString());if(kind==='hidden')h.setVisible(false);if(kind==='offline')h.setOnline(false);await h.advance(kind==='throttle'?1000:50,{throttle:kind==='throttle'});assert.equal(h.calls.length,3);assert.equal(h.session.snapshot().phase,'cancelled');}});
await test('identity expires at15 seconds independently of30-second clock sample',async()=>{const h=harness();await h.session.calibrate(h.config);await h.advance(15001);assert.throws(()=>h.session.armRehearsal(new Date(h.wall()+1000).toISOString()),/freshness/);});
await test('in-flight cancellation ignores late success and retains safe dispatch metadata',async()=>{const h=harness();await h.session.calibrate(h.config);let resolve;h.port.command=c=>{h.calls.push(c);return new Promise(r=>resolve=r);};h.session.armRehearsal(new Date(h.wall()+1000).toISOString());await h.advance(1050);assert.equal(h.session.snapshot().phase,'in_flight');const dispatch=h.session.snapshot().dispatchAt;h.session.cancel();resolve({ok:false,reason:'unavailable'});await flush();assert.equal(h.session.snapshot().phase,'uncertain');assert.equal(h.session.snapshot().receipt,null);assert.equal(h.session.snapshot().dispatchAt,dispatch);});
await test('four-second unresolved request yields uncertainty with no retry',async()=>{const h=harness();await h.session.calibrate(h.config);h.port.command=c=>{h.calls.push(c);return new Promise(()=>{});};h.session.armRehearsal(new Date(h.wall()+1000).toISOString());await h.advance(5200);assert.equal(h.calls.length,4);assert.equal(h.session.snapshot().phase,'uncertain');});
await test('arbitrary acknowledgment or forged observer/other account evidence does not unlock race',async()=>{const h=harness();await rehearsal(h);assert.throws(()=>h.session.acceptRehearsal({checked:true}));for(const mutate of [x=>x.observer.backends[1].pid=1,x=>x.observer.backends[0].blockingPids=[],x=>x.browsers[1].receipt.actorId=randomUUID(),x=>x.observer.heldMs=2001,x=>x.browsers[0].receipt.token='not-allowed']){const e=validRehearsal(h);mutate(e);assert.throws(()=>h.session.acceptRehearsal(e));}assert.throws(()=>h.session.armRace(new Date(h.wall()+1000).toISOString(),randomUUID()));});
await test('valid structure permits fresh calibration/fixture verification only',async()=>{const h=harness();await ready(h);assert.equal(h.calls.length,8);assert.equal(h.session.snapshot().phase,'ready');});
await test('one checkin and identical explicit winner replay exhaust exactly10 posts',async()=>{const h=harness();await ready(h);const operation=randomUUID();h.session.armRace(new Date(h.wall()+1000).toISOString(),operation);await h.advance(1100);assert.equal(h.calls.length,9);const result=h.session.snapshot().receipt;assert.equal(result.outcome,'simulated_accepted');const original=h.calls[8];h.port.command=async c=>{h.calls.push(c);assert.equal(c,original);return {ok:true,events:[],qrText:null,secretUnavailable:true,replayed:true,receipt:wireReceipt(result)};};await h.session.replayWinner({operationId:operation,primaryCount:1,acceptedCount:1,usedCount:1});assert.equal(h.calls.length,10);assert.equal(h.session.snapshot().phase,'replayed');await assert.rejects(()=>h.session.replayWinner({operationId:operation,primaryCount:1,acceptedCount:1,usedCount:1}));assert.equal(h.calls.length,10);});
await test('winner replay refreshes identity after 60s without extra calibration POSTs',async()=>{
 const h=harness();await ready(h);const operationId=randomUUID();h.session.armRace(new Date(h.wall()+1000).toISOString(),operationId);await h.advance(1100);
 const result=h.session.snapshot().receipt, original=h.calls[8];await h.advance(60000);let reads=0;h.port.mfa=async()=>{reads++;return {ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true};};
 h.port.command=async c=>{h.calls.push(c);assert.equal(c,original);return {ok:true,events:[],qrText:null,secretUnavailable:true,replayed:true,receipt:wireReceipt(result)};};
 await h.session.replayWinner({operationId,primaryCount:1,acceptedCount:1,usedCount:1});assert.equal(reads,1);assert.equal(h.calls.length,10);assert.equal(h.session.snapshot().phase,'replayed');
});
await test('page budget persists across controllers and cancellation cannot resume by remount',async()=>{const page={},a=pageQaBudget(page),b=pageQaBudget(page);assert.equal(a,b);const h=harness();const s=new TimedQaSession(h.port,a);await s.calibrate(h.config);s.cancel();const next=new TimedQaSession(h.port,b);await assert.rejects(()=>next.calibrate(h.config),/environment_changed/);assert.equal(a.used,3);});
await test('cancelled calibration cannot accept a late MFA result or send probes',async()=>{const h=harness();let resolve;h.port.mfa=()=>new Promise(r=>resolve=r);const pending=h.session.calibrate(h.config);await flush();h.session.cancel();resolve({ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true});await pending;assert.equal(h.calls.length,0);assert.equal(h.session.snapshot().phase,'cancelled');});
const contractBuild=await build({entryPoints:['src/lib/admission/contract.ts'],bundle:true,platform:'node',format:'esm',write:false});
await writeFile(join(dir,'contract.mjs'),contractBuild.outputFiles[0].text);
const {parseAdmissionInput}=await import(pathToFileURL(join(dir,'contract.mjs')));
await test('REQUIRED: real transport permits calibration probes to reach authoritative DB',async()=>{
 const h=harness();let forwarded=0;const original=h.port.command;
 h.port.command=async c=>{const parsed=parseAdmissionInput(c,'POST');if(!parsed){h.calls.push(c);return {ok:false,reason:'invalid'};}forwarded++;return original(parsed);};
 await h.session.calibrate(h.config);
 assert.deepEqual({phase:h.session.snapshot().phase,attempted:h.calls.length,forwarded},{phase:'calibrated',attempted:3,forwarded:3});
});
await test('REQUIRED: exact rehearsal probe passes real transport validator',()=>{
 assert.notEqual(parseAdmissionInput({action:'verify',eventId:QA_EVENT,token:'DAY07_REHEARSAL_PROBE'},'POST'),null);
});
await test('REQUIRED: 4s response bound survives delayed event-loop timer callback',async()=>{
 const h=harness();await h.session.calibrate(h.config);const original=h.port.command;
 h.port.command=async c=>{h.stall(5000);return original(c);};
 h.session.armRehearsal(new Date(h.wall()+1000).toISOString());await h.advance(1100);
 assert.equal(h.session.snapshot().phase,'uncertain');
 assert.equal(h.session.snapshot().receipt,null);
});
await test('REQUIRED: exact winner replay also rejects response after monotonic4s deadline',async()=>{
 const h=harness();await ready(h);const operationId=randomUUID();h.session.armRace(new Date(h.wall()+1000).toISOString(),operationId);await h.advance(1100);
 const result=h.session.snapshot().receipt;
 h.port.command=async c=>{h.calls.push(c);h.stall(4100);return {ok:true,events:[],qrText:null,secretUnavailable:true,replayed:true,receipt:wireReceipt(result)};};
 await h.session.replayWinner({operationId,primaryCount:1,acceptedCount:1,usedCount:1});
 assert.equal(h.session.snapshot().phase,'uncertain');
});

await test('idle lifecycle changes before any work leave the form usable and make no requests',async()=>{
 const h=harness();h.setVisible(false);h.session.environmentChanged();assert.equal(h.session.snapshot().phase,'idle');
 h.setVisible(true);h.setOnline(false);h.session.environmentChanged();assert.equal(h.session.snapshot().phase,'idle');
 h.setOnline(true);h.session.environmentChanged('navigation');assert.equal(h.calls.length,0);assert.equal(h.budget.invalidated,false);
 await h.session.calibrate(h.config);assert.equal(h.session.snapshot().phase,'calibrated');assert.equal(h.calls.length,3);
});
await test('explicit zero-POST reset is inert, visible/online only and requires fresh calibration',async()=>{
 const h=harness();assert.equal(h.session.canResetBeforeDispatch(),false);h.session.cancel('user_cancelled');
 assert.equal(h.session.canResetBeforeDispatch(),true);h.setVisible(false);assert.throws(()=>h.session.resetBeforeDispatch(),/environment/);
 h.setVisible(true);h.setOnline(false);assert.throws(()=>h.session.resetBeforeDispatch(),/environment/);h.setOnline(true);
 h.session.resetBeforeDispatch();assert.equal(h.session.snapshot().phase,'idle');assert.equal(h.budget.used,0);assert.equal(h.calls.length,0);assert.equal(h.timers.size,0);
 assert.throws(()=>h.session.armRehearsal(new Date(h.wall()+1000).toISOString()),/not_ready/);
 await h.session.calibrate(h.config);assert.equal(h.calls.length,3);assert.equal(h.session.snapshot().phase,'calibrated');
});
await test('late MFA result from a cancelled zero-POST attempt cannot cancel or replace a reset attempt',async()=>{
 for(const oldFails of [false,true]){
  const h=harness();let resolveOld,rejectOld,resolveNew;let count=0;
  h.port.mfa=()=>++count===1?new Promise((r,j)=>{resolveOld=r;rejectOld=j;}):new Promise(r=>resolveNew=r);
  const old=h.session.calibrate(h.config);await flush();h.session.environmentChanged('hidden');assert.equal(h.session.canResetBeforeDispatch(),true);
  h.session.resetBeforeDispatch();const fresh=h.session.calibrate(h.config);await flush();
  if(oldFails)rejectOld(new Error('private transport detail'));else resolveOld({ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true});
  await old;assert.equal(h.session.snapshot().phase,'calibrating');assert.equal(h.budget.invalidated,false);assert.equal(h.calls.length,0);
  resolveNew({ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true});await fresh;assert.equal(h.session.snapshot().phase,'calibrated');assert.equal(h.calls.length,3);
 }
});
await test('reset stays forbidden after any QR POST and in-flight cancellation remains uncertain',async()=>{
 const h=harness();await h.session.calibrate(h.config);h.session.environmentChanged('hidden');
 assert.equal(h.session.canResetBeforeDispatch(),false);assert.throws(()=>h.session.resetBeforeDispatch(),/reset_not_available/);assert.equal(h.budget.used,3);
 const x=harness();await x.session.calibrate(x.config);x.port.command=()=>new Promise(()=>{});
 x.session.armRehearsal(new Date(x.wall()+1000).toISOString());await x.advance(1050);x.session.environmentChanged('hidden');
 assert.equal(x.session.snapshot().phase,'uncertain');assert.equal(x.session.canResetBeforeDispatch(),false);assert.throws(()=>x.session.resetBeforeDispatch(),/reset_not_available/);
});
await test('zero-POST page remount can recover explicitly; consumed invalidated page cannot',async()=>{
 const h=harness();h.session.cancel();const next=new TimedQaSession(h.port,h.budget);assert.equal(next.snapshot().phase,'cancelled');
 assert.equal(next.canResetBeforeDispatch(),true);next.resetBeforeDispatch();await next.calibrate(h.config);next.cancel();
 const consumed=new TimedQaSession(h.port,h.budget);assert.equal(consumed.canResetBeforeDispatch(),false);assert.equal(h.budget.used,3);
});
await test('calibration errors expose only safe known codes, never raw transport details',async()=>{
 const h=harness({mfa:false});await h.session.calibrate(h.config);assert.equal(h.session.snapshot().message,'session_forbidden');
 const x=harness();x.port.mfa=async()=>{throw new Error('secret-like unknown transport detail');};await x.session.calibrate(x.config);
 assert.ok(!x.session.snapshot().message.includes('secret-like'));assert.equal(x.calls.length,0);
});
await test('REVIEW: reset is fenced at each promise boundary before first QR dispatch', async () => {
 for (let ticks = 0; ticks < 20; ticks++) {
  const h = harness(); let resolveOld; let count = 0;
  h.port.mfa = () => ++count === 1 ? new Promise(r => resolveOld = r) : Promise.resolve({ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true});
  const old = h.session.calibrate(h.config); await flush();
  resolveOld({ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true});
  for(let i=0;i<ticks;i++) await Promise.resolve();
  if (h.budget.used !== 0) { await old; continue; }
  h.session.cancel('review_cancel'); h.session.resetBeforeDispatch();
  const fresh = h.session.calibrate(h.config);
  await Promise.all([old, fresh]);
  assert.equal(h.budget.used,3,'budget at ticks='+ticks);
  assert.equal(h.calls.length,3,'calls at ticks='+ticks);
  assert.equal(h.session.snapshot().phase,'calibrated','phase at ticks='+ticks);
 }
});

await test('read-only readiness needs no run/window and cannot arm or consume QR budget', async () => {
 const h = harness(); let reads = 0;
 h.port.mfa = async () => { reads++; return { ok:true, userId:QA_ACTORS[0], aal2:true, hasVerifiedTotp:true, pendingFactorId:'PRIVATE_FACTOR', secret:'PRIVATE_SECRET' }; };
 await h.session.checkSession(QA_ACTORS[0]);
 const state = h.session.snapshot();
 assert.equal(reads, 1); assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
 assert.deepEqual(h.budget, {used:0, invalidated:false});
 assert.equal(state.phase, 'idle'); assert.equal(state.runId, null); assert.equal(state.windowStart, null);
 assert.deepEqual(state.sessionReadiness, {phase:'ready', reason:'ready', selectedActorId:QA_ACTORS[0], userId:QA_ACTORS[0], aal2:true, hasVerifiedTotp:true});
 assert.ok(!JSON.stringify(state).includes('PRIVATE_'));
 assert.throws(() => h.session.armRehearsal(new Date(h.wall()+1000).toISOString()), /rehearsal_not_ready/);
});
await test('readiness and calibration distinguish safe server, identity and MFA reasons before any QR POST', async () => {
 const ready = {ok:true, userId:QA_ACTORS[0], aal2:true, hasVerifiedTotp:true};
 const cases = [
  [{ok:false, reason:'unconfigured'}, 'unconfigured'],
  [{ok:false, reason:'forbidden'}, 'forbidden'],
  [{ok:false, reason:'unavailable'}, 'unavailable'],
  [{ok:false, reason:'PRIVATE_ERROR'}, 'unavailable'],
  [{...ready, userId:QA_ACTORS[1]}, 'wrong_account'],
  [{...ready, hasVerifiedTotp:false}, 'factor_required'],
  [{...ready, aal2:false}, 'challenge_required'],
  [{...ready, userId:'PRIVATE_ID'}, 'unavailable'],
  [{...ready, aal2:'aal2'}, 'unavailable'],
  [{ok:true, aal2:true, hasVerifiedTotp:true}, 'unavailable'],
  [null, 'unavailable'],
 ];
 for (const [response, reason] of cases) {
  const h = harness(); h.port.mfa = async () => response;
  await h.session.checkSession(QA_ACTORS[0]);
  assert.equal(h.session.snapshot().sessionReadiness.reason, reason);
  assert.equal(h.session.snapshot().phase, 'idle'); assert.equal(h.budget.invalidated, false);
  assert.ok(!JSON.stringify(h.session.snapshot()).includes('PRIVATE_'));
  await h.session.calibrate(h.config);
  assert.equal(h.session.snapshot().message, 'session_'+reason);
  assert.equal(h.session.snapshot().phase, 'cancelled'); assert.equal(h.calls.length, 0);
 }
 const h=harness(); h.port.mfa=async()=>{throw new Error('PRIVATE_TOKEN');};
 await h.session.checkSession(QA_ACTORS[0]);
 assert.equal(h.session.snapshot().sessionReadiness.reason,'unavailable');
 assert.ok(!JSON.stringify(h.session.snapshot()).includes('PRIVATE_TOKEN'));
});
await test('READY never substitutes for calibration fresh current-account/MFA read', async () => {
 for (const response of [{ok:false,reason:'forbidden'}, {ok:true,userId:QA_ACTORS[1],aal2:true,hasVerifiedTotp:true}, {ok:true,userId:QA_ACTORS[0],aal2:false,hasVerifiedTotp:true}]) {
  const h=harness(); let reads=0; const original=h.port.mfa;
  h.port.mfa=async()=>{reads++; return reads===1?original():response;};
  await h.session.checkSession(QA_ACTORS[0]);
  assert.equal(h.session.snapshot().sessionReadiness.phase,'ready');
  await h.session.calibrate(h.config);
  assert.equal(reads,2); assert.equal(h.calls.length,0); assert.equal(h.session.snapshot().phase,'cancelled');
 }
});
await test('readiness rejects duplicate clicks and fences actor/lifecycle changes without invalidating idle run', async () => {
 for (const kind of ['actor','hidden','offline','signout']) {
  const h=harness(); let resolveOld, resolveNew, reads=0;
  h.port.mfa=()=>++reads===1?new Promise(r=>resolveOld=r):new Promise(r=>resolveNew=r);
  const old=h.session.checkSession(QA_ACTORS[0]); await flush();
  await h.session.checkSession(QA_ACTORS[0]); assert.equal(reads,1);
  if(kind==='actor') h.session.invalidateSession(); else h.session.environmentChanged(kind);
  assert.equal(h.session.snapshot().phase,'idle'); assert.equal(h.budget.invalidated,false);
  const fresh=h.session.checkSession(QA_ACTORS[1]); await flush();
  resolveOld({ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true}); await old;
  assert.equal(h.session.snapshot().sessionReadiness.phase,'checking');
  assert.equal(h.session.snapshot().sessionReadiness.selectedActorId,QA_ACTORS[1]);
  resolveNew({ok:true,userId:QA_ACTORS[1],aal2:true,hasVerifiedTotp:true}); await fresh;
  assert.equal(h.session.snapshot().sessionReadiness.userId,QA_ACTORS[1]); assert.equal(h.calls.length,0);
 }
});
await test('readiness timeout and delayed event loop discard late results; retry is explicit', async () => {
 const h=harness(); let resolve, reads=0;
 h.port.mfa=()=>{reads++;return new Promise(r=>resolve=r);};
 const pending=h.session.checkSession(QA_ACTORS[0]); await flush(); await h.advance(4000); await pending;
 assert.equal(h.session.snapshot().sessionReadiness.reason,'response_timeout'); assert.equal(reads,1);
 resolve({ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true}); await flush();
 assert.equal(h.session.snapshot().sessionReadiness.reason,'response_timeout'); assert.equal(h.calls.length,0);
 const x=harness(); x.port.mfa=async()=>{x.stall(4001);return {ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true};};
 await x.session.checkSession(QA_ACTORS[0]); assert.equal(x.session.snapshot().sessionReadiness.reason,'response_timeout');
 assert.equal(x.timers.size,0);
});
await test('readiness refuses hidden/offline reads and clears READY after lifecycle invalidation', async () => {
 for(const kind of ['hidden','offline']) {
  const h=harness(); let reads=0; const original=h.port.mfa; h.port.mfa=()=>{reads++;return original();};
  if(kind==='hidden')h.setVisible(false);else h.setOnline(false);
  await h.session.checkSession(QA_ACTORS[0]); assert.equal(reads,0);
  assert.equal(h.session.snapshot().sessionReadiness.reason,'environment_changed');
  h.setVisible(true);h.setOnline(true);await h.session.checkSession(QA_ACTORS[0]);
  assert.equal(h.session.snapshot().sessionReadiness.phase,'ready');
  h.session.environmentChanged();assert.equal(h.session.snapshot().sessionReadiness.reason,'environment_changed');
  assert.equal(h.session.snapshot().sessionReadiness.userId,null);assert.equal(h.budget.invalidated,false);
 }
});
await test('readiness cannot reset a cancelled run or refresh calibration after consumed POSTs', async () => {
 const h=harness();h.session.cancel();await h.session.checkSession(QA_ACTORS[0]);
 assert.equal(h.session.snapshot().sessionReadiness.phase,'ready');assert.equal(h.session.snapshot().phase,'cancelled');
 assert.equal(h.budget.invalidated,true);await assert.rejects(()=>h.session.calibrate(h.config),/environment_changed/);
 h.session.resetBeforeDispatch();await h.session.calibrate(h.config);assert.equal(h.budget.used,3);
 let reads=0;h.port.mfa=async()=>{reads++;return {ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true};};
 await h.advance(15001);await h.session.checkSession(QA_ACTORS[0]);assert.equal(reads,0);
 assert.throws(()=>h.session.armRehearsal(new Date(h.wall()+1000).toISOString()),/freshness_expired/);
 h.session.cancel();await h.session.checkSession(QA_ACTORS[0]);assert.equal(reads,0);
 assert.equal(h.session.canResetBeforeDispatch(),false);assert.equal(h.budget.used,3);
});
await test('calibration fences an outstanding independent readiness response', async () => {
 const h=harness();let resolve;const original=h.port.mfa;let reads=0;
 h.port.mfa=()=>++reads===1?new Promise(r=>resolve=r):original();
 const check=h.session.checkSession(QA_ACTORS[0]);await flush();await h.session.calibrate(h.config);
 resolve({ok:false,reason:'forbidden'});await check;
 assert.equal(h.session.snapshot().phase,'calibrated');assert.equal(h.calls.length,3);
 assert.equal(h.session.snapshot().sessionReadiness.phase,'unchecked');
});


await test('live-like slow clock probes are accepted only within the explicit 1500ms bound',async()=>{
 for(const latency of [400,900,1500]){const h=harness({latency});await h.session.calibrate(h.config);assert.equal(h.session.snapshot().phase,'calibrated');assert.equal(h.session.snapshot().uncertaintyMs,Math.ceil(latency/2)+1);assert.equal(h.calls.length,3);}
 const h=harness({latency:1501});await h.session.calibrate(h.config);assert.equal(h.session.snapshot().phase,'cancelled');assert.equal(h.calls.length,3);assert.equal(h.session.snapshot().message,'insufficient_good_samples');
});
await test('high-latency calibration allows observed rehearsal overlap within measured clock error',async()=>{
 const h=harness({latency:900});await h.session.calibrate(h.config);
 const target=new Date(h.wall()+h.session.snapshot().offsetMs+1000).toISOString();h.session.armRehearsal(target);await h.advance(1050);
 assert.equal(h.session.snapshot().phase,'rehearsal_done');const e=validRehearsal(h);
 const dispatch=Date.parse(h.session.snapshot().dispatchAt),observed=dispatch-300;
 e.observer.lockAttemptAt=new Date(observed-100).toISOString();e.observer.lockAcquiredAt=new Date(observed-99).toISOString();e.observer.observedAt=new Date(observed).toISOString();e.observer.lockReleasedAt=new Date(observed+1).toISOString();e.observer.heldMs=101;
 e.observer.backends.forEach(b=>{b.backendStart=new Date(observed-10000).toISOString();b.transactionStart=new Date(observed-1000).toISOString();b.queryStart=new Date(observed-1).toISOString();});
 h.session.acceptRehearsal(e);assert.match(h.session.snapshot().message,/Структура/);
});
await test('clock allowance cannot accept wrong run, old schema, reused PID, changed own uncertainty or old receipt',async()=>{
 const h=harness();await rehearsal(h);
 for(const mutate of [e=>e.runId=randomUUID(),e=>e.schema='day07-rehearsal-v1',e=>e.observer.backends[1].pid=e.observer.backends[0].pid,e=>e.browsers[0].uncertaintyMs++,e=>e.browsers[0].receipt.correlationId=randomUUID(),e=>e.browsers[1].receipt.at=h.config.windowStart,e=>e.browsers[1].uncertaintyMs=752,e=>delete e.browsers[1].uncertaintyMs]){const e=validRehearsal(h);mutate(e);assert.throws(()=>h.session.acceptRehearsal(e));}
 const outside=validRehearsal(h);outside.observer.observedAt=new Date(Date.parse(outside.browsers[0].dispatchedAt)-outside.browsers[0].uncertaintyMs-1).toISOString();assert.throws(()=>h.session.acceptRehearsal(outside),/invalid_receipt_timing/);
});



// Synthetic transport and clock model. These checks do not assert actual DB overlap.
const EPOCH = Date.parse('2026-10-08T12:00:00.000Z');
function probeScript(h, samples) {
 let index=0;const original=h.port.command;
 h.port.command=async c=>{
  if(c.token!=='DAY07_CLOCK_PROBE')return original(c);
  h.calls.push(c);const sample=samples[index++]||{};h.stall(sample.rtt??100);
  if(sample.wallDelta)h.stepWall(sample.wallDelta);
  const at=new Date(EPOCH+h.mono()+(sample.serverShift??0)).toISOString();
  return {ok:true,events:[],qrText:null,secretUnavailable:true,replayed:false,receipt:{operationId:null,correlationId:randomUUID(),action:'verify',outcome:'invalid_token',eventId:QA_EVENT,participationId:null,passId:null,version:null,generation:null,actorId:QA_ACTORS[0],at,simulated:true,reentryAllowed:false,...sample.receipt}};
 };
}
async function plannedRehearsal(h,lead=100000){
 const target=new Date(h.wall()+lead).toISOString();h.session.prepareRehearsal(h.config,target);await h.advance(lead+100);assert.equal(h.session.snapshot().phase,'rehearsal_done');return target;
}
async function plannedRace(h){
 await plannedRehearsal(h);h.session.acceptRehearsal(validRehearsal(h));const operationId=randomUUID();const target=new Date(h.wall()+30000).toISOString();h.session.prepareRace(h.config,target,operationId);await h.advance(30100);assert.equal(h.session.snapshot().phase,'result');return operationId;
}
await test('two good samples tolerate one cold slow first probe without replacement and retain all diagnostics',async()=>{
 const h=harness();probeScript(h,[{rtt:2500},{rtt:100},{rtt:100}]);await h.session.calibrate(h.config);
 assert.equal(h.session.snapshot().phase,'calibrated');assert.equal(h.calls.length,3);assert.equal(h.session.snapshot().uncertaintyMs,51);
 assert.deepEqual(h.session.snapshot().clockSamples.map(s=>[s.rttMs,s.quality,s.reason]),[[2500,'slow','slow_transport'],[100,'good',null],[100,'good',null]]);
 assert.ok(h.session.snapshot().clockSamples.every(s=>Number.isFinite(s.intervalLowerMs)&&s.intervalLowerMs<=s.intervalUpperMs));
});
await test('one good, any disjoint third good, and contradictory slow interval each fail without fourth probe',async()=>{
 for(const [samples,reason]of [
  [[{rtt:2000},{rtt:100},{rtt:2500}],'insufficient_good_samples'],
  [[{rtt:100},{rtt:100},{rtt:100,serverShift:1000}],'unstable_clock'],
  [[{rtt:100},{rtt:100},{rtt:2000,serverShift:10000}],'unstable_clock'],
 ]){const h=harness();probeScript(h,samples);await h.session.calibrate(h.config);assert.equal(h.calls.length,3);assert.equal(h.session.snapshot().phase,'cancelled');assert.equal(h.session.snapshot().message,reason);}
});
await test('1500 inclusive is good, fractional slow below 4000 is ignored, and 4000 is fatal',async()=>{
 for(const rtt of [1500,1500.001,3999.999,4000]){
  const h=harness();probeScript(h,[{rtt},{rtt:100},{rtt:100}]);await h.session.calibrate(h.config);const s=h.session.snapshot();
  assert.equal(s.phase,rtt===4000?'cancelled':'calibrated');assert.equal(h.calls.length,rtt===4000?1:3);
  assert.equal(s.clockSamples[0].quality,rtt===4000?'fatal':rtt<=1500?'good':'slow');assert.equal(s.clockSamples[0].rttMs,rtt);
 }
});
await test('all-good common intersection supports touching endpoints and conservative 751ms maximum',async()=>{
 const h=harness();probeScript(h,[{rtt:0},{rtt:0,serverShift:2},{rtt:0,serverShift:1}]);await h.session.calibrate(h.config);
 assert.equal(h.session.snapshot().phase,'calibrated');assert.equal(h.session.snapshot().uncertaintyMs,1);assert.equal(h.session.snapshot().offsetMs,1);
 const x=harness({latency:1500});await x.session.calibrate(x.config);assert.equal(x.session.snapshot().uncertaintyMs,751);
});
await test('positive and negative25ms wall discrepancy do not move monotonic intervals; beyond25 is fatal even slow',async()=>{
 let reference;
 for(const delta of [0,25,-25]){
  const h=harness();probeScript(h,[{rtt:100,wallDelta:delta},{rtt:100},{rtt:100}]);await h.session.calibrate(h.config);const s=h.session.snapshot();assert.equal(s.phase,'calibrated');
  const intervals=s.clockSamples.map(x=>[x.intervalLowerMs,x.intervalUpperMs]);if(reference)assert.deepEqual(intervals,reference);else reference=intervals;
  assert.equal(s.clockSamples[0].wallDeltaMs,delta);assert.equal(s.offsetMs,50-delta);
 }
 for(const delta of [25.001,-25.001]){
  const h=harness();probeScript(h,[{rtt:2000,wallDelta:delta},{rtt:100},{rtt:100}]);await h.session.calibrate(h.config);
  assert.equal(h.calls.length,1);assert.equal(h.session.snapshot().message,'clock_step');assert.equal(h.session.snapshot().clockSamples[0].quality,'fatal');
 }
});
await test('slow responses cannot hide invalid actor, action, shape, timestamp or replay state; diagnostics contain no raw data',async()=>{
 for(const patch of [{actorId:QA_ACTORS[1]},{eventId:randomUUID()},{action:'checkin'},{at:'PRIVATE_BAD_TIME'},{passId:QA_PASS},{secret:'PRIVATE_SECRET'}]){
  const h=harness();probeScript(h,[{rtt:2200,receipt:patch}]);await h.session.calibrate(h.config);const s=h.session.snapshot();
  assert.equal(h.calls.length,1);assert.equal(s.phase,'cancelled');assert.equal(s.clockSamples[0].quality,'fatal');assert.equal(s.clockSamples[0].rttMs,2200);assert.ok(!JSON.stringify(s).includes('PRIVATE_'));
 }
 const h=harness();probeScript(h,[{rtt:2200}]);const original=h.port.command;h.port.command=async c=>({...await original(c),replayed:true});await h.session.calibrate(h.config);assert.equal(h.calls.length,1);assert.equal(h.session.snapshot().message,'unexpected_probe');
});
await test('failed unresolved and nonfinite/negative RTT attempts retain sanitized failure diagnostics',async()=>{
 const h=harness();h.port.command=c=>{h.calls.push(c);return new Promise(()=>{});};const work=h.session.calibrate(h.config);await flush();await h.advance(4000);await work;
 assert.equal(h.calls.length,1);assert.equal(h.session.snapshot().clockSamples[0].rttMs,4000);assert.equal(h.session.snapshot().clockSamples[0].reason,'response_timeout');
 for(const value of [-1,NaN,Infinity]){
  const x=harness();const original=x.port.command;x.port.command=async c=>{const r=await original(c);x.port.mono=()=>value;return r;};await x.session.calibrate(x.config);
  assert.equal(x.calls.length,1);assert.equal(x.session.snapshot().phase,'cancelled');assert.equal(x.session.snapshot().clockSamples[0].quality,'fatal');assert.equal(x.session.snapshot().clockSamples[0].rttMs,Number.isFinite(value)?value:null);
 }
});
await test('100-second explicit plan remains network-inert until JIT, then sends exactly3probes and1rehearsal',async()=>{
 const h=harness();let reads=0;const mfa=h.port.mfa;h.port.mfa=()=>{reads++;return mfa();};const target=new Date(h.wall()+100000).toISOString();h.session.prepareRehearsal(h.config,target);
 assert.equal(h.session.snapshot().phase,'rehearsal_waiting');assert.equal(h.session.snapshot().countdownMs,100000);assert.equal(reads,0);assert.equal(h.calls.length,0);
 await h.advance(89950);assert.equal(h.calls.length,0);assert.equal(reads,0);assert.equal(h.session.snapshot().countdownMs,10050);
 await h.advance(50);assert.equal(reads,1);assert.equal(h.calls.length,3);assert.equal(h.session.snapshot().phase,'rehearsal_armed');
 await h.advance(10100);assert.equal(h.calls.length,4);assert.equal(h.session.snapshot().phase,'rehearsal_done');assert.equal(h.session.snapshot().target,target);
});
await test('coarse30/120-second boundaries and planned window are checked before work',()=>{
 for(const lead of [29999,120001]){const h=harness();assert.throws(()=>h.session.prepareRehearsal(h.config,new Date(h.wall()+lead).toISOString()),/target_outside_bound/);assert.equal(h.calls.length,0);assert.equal(h.timers.size,0);}
 for(const lead of [30000,120000]){const h=harness();h.session.prepareRehearsal(h.config,new Date(h.wall()+lead).toISOString());assert.equal(h.session.snapshot().phase,'rehearsal_waiting');h.session.cancel();}
 const h=harness();assert.throws(()=>h.session.prepareRehearsal({...h.config,windowStart:new Date(h.wall()+30000).toISOString()},new Date(h.wall()+30000).toISOString()),/target_outside_bound/);
 const x=harness();assert.throws(()=>x.session.prepareRehearsal({...x.config,windowStart:new Date(x.wall()-1170000).toISOString()},new Date(x.wall()+30000).toISOString()),/target_outside_bound/);
});
await test('one-arm inputs are frozen and direct or duplicate scheduling cannot bypass pending plan',async()=>{
 const h=harness();const config={...h.config},target=new Date(h.wall()+30000).toISOString();h.session.prepareRehearsal(config,target);config.actorId=QA_ACTORS[1];config.runId=randomUUID();config.windowStart='bad';
 assert.equal(h.session.snapshot().actorId,QA_ACTORS[0]);assert.throws(()=>h.session.prepareRehearsal(h.config,target),/already_armed/);
 await assert.rejects(()=>h.session.calibrate(h.config),/already_armed/);assert.throws(()=>h.session.armRehearsal(target),/already_armed/);await assert.rejects(()=>h.session.verifyReady(),/already_armed/);
 assert.throws(()=>{h.session.snapshot().target='bad';},TypeError);await h.advance(30100);assert.equal(h.session.snapshot().phase,'rehearsal_done');assert.equal(h.calls.length,4);assert.equal(h.session.snapshot().target,target);
});
await test('coarse waiting cancellation, hidden/offline/signout and late event loop never catch up',async()=>{
 for(const change of ['cancel','hidden','offline','signout','late','wall']){
  const h=harness();h.session.prepareRehearsal(h.config,new Date(h.wall()+30000).toISOString());
  if(change==='cancel')h.session.cancel('user_cancelled');if(change==='hidden')h.setVisible(false);if(change==='offline')h.setOnline(false);if(change==='signout')h.session.environmentChanged('signout');if(change==='wall')h.stepWall(26);
  await h.advance(change==='late'?20500:30100,{throttle:change==='late'});assert.equal(h.calls.length,0);assert.equal(h.session.snapshot().phase,'cancelled');assert.equal(h.timers.size,0);
 }
});
await test('cancel/reset epoch discards old pending JIT MFA and only fresh plan may continue',async()=>{
 const h=harness();let resolveOld;const mfa=h.port.mfa;h.port.mfa=()=>new Promise(r=>resolveOld=r);h.session.prepareRehearsal(h.config,new Date(h.wall()+30000).toISOString());await h.advance(20000);assert.equal(h.session.snapshot().phase,'calibrating');
 h.session.cancel();h.session.resetBeforeDispatch();h.port.mfa=mfa;const target=new Date(h.wall()+30000).toISOString();h.session.prepareRehearsal(h.config,target);
 resolveOld({ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true});await flush();assert.equal(h.calls.length,0);assert.equal(h.session.snapshot().phase,'rehearsal_waiting');await h.advance(30100);assert.equal(h.calls.length,4);assert.equal(h.session.snapshot().phase,'rehearsal_done');
});
await test('fresh JIT MFA ignores stale READY and insufficient prep or skew cancels without rescheduling',async()=>{
 const h=harness();await h.session.checkSession(QA_ACTORS[0]);h.port.mfa=async()=>({ok:true,userId:QA_ACTORS[1],aal2:true,hasVerifiedTotp:true});h.session.prepareRehearsal(h.config,new Date(h.wall()+30000).toISOString());await h.advance(30100);assert.equal(h.calls.length,0);assert.equal(h.session.snapshot().message,'session_wrong_account');
 const slow=harness();slow.port.mfa=async()=>{slow.stall(3999);return {ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true};};probeScript(slow,[{rtt:3999},{rtt:1500},{rtt:1500}]);const target=new Date(slow.wall()+30000).toISOString();slow.session.prepareRehearsal(slow.config,target);await slow.advance(31000);assert.equal(slow.calls.length,3);assert.equal(slow.session.snapshot().phase,'cancelled');assert.equal(slow.session.snapshot().target,target);
 for(const skew of [15000,-15000]){
  const x=harness();probeScript(x,[{serverShift:skew},{serverShift:skew},{serverShift:skew}]);x.session.prepareRehearsal(x.config,new Date(x.wall()+30000).toISOString());await x.advance(30100);assert.equal(x.calls.length,3);assert.equal(x.session.snapshot().phase,'cancelled');
 }
});
await test('one-arm full path requires external reconciliation, freezes op and ends at exactly10POST including late replay',async()=>{
 const h=harness();assert.throws(()=>h.session.prepareRace(h.config,new Date(h.wall()+30000).toISOString(),randomUUID()),/race_not_ready/);
 const operationId=await plannedRace(h);assert.equal(h.calls.length,9);assert.equal(h.calls[8].operationId,operationId);assert.equal(h.session.snapshot().operationId,operationId);const primary=h.calls[8],result=h.session.snapshot().receipt;
 await h.advance(60000);const read=h.port.mfa;let reads=0;h.port.mfa=()=>{reads++;return read();};h.port.command=async c=>{h.calls.push(c);assert.equal(c,primary);return {ok:true,events:[],qrText:null,secretUnavailable:true,replayed:true,receipt:wireReceipt(result)};};
 await h.session.replayWinner({operationId,primaryCount:1,acceptedCount:1,usedCount:1});assert.equal(reads,1);assert.equal(h.calls.length,10);assert.equal(h.session.snapshot().phase,'replayed');
 await assert.rejects(()=>h.session.replayWinner({operationId,primaryCount:1,acceptedCount:1,usedCount:1}),/coordinator_ack_required/);assert.equal(h.calls.length,10);
});
await test('replay validates ack then fresh MFA; early failure preserves original receipt and cannot repeat',async()=>{
 const h=harness();const operationId=await plannedRace(h),original=h.session.snapshot().receipt;let reads=0;
 h.port.mfa=async()=>{reads++;return {ok:true,userId:QA_ACTORS[1],aal2:true,hasVerifiedTotp:true,secret:'PRIVATE'};};
 await assert.rejects(()=>h.session.replayWinner({operationId:randomUUID(),primaryCount:1,acceptedCount:1,usedCount:1}),/coordinator_ack_required/);assert.equal(reads,0);
 await h.session.replayWinner({operationId,primaryCount:1,acceptedCount:1,usedCount:1});assert.equal(reads,1);assert.equal(h.calls.length,9);assert.equal(h.session.snapshot().phase,'replay_blocked');assert.equal(h.session.snapshot().message,'session_wrong_account');assert.equal(h.session.snapshot().receipt,original);assert.ok(!JSON.stringify(h.session.snapshot()).includes('PRIVATE'));
 await assert.rejects(()=>h.session.replayWinner({operationId,primaryCount:1,acceptedCount:1,usedCount:1}),/coordinator_ack_required/);assert.equal(reads,1);
});
await test('replay hidden/offline and cancellation while MFA pending send no POST and retain known original result',async()=>{
 for(const change of ['hidden','offline','cancel']){
  const h=harness();const operationId=await plannedRace(h),original=h.session.snapshot().receipt;let resolve;
  h.port.mfa=()=>new Promise(r=>resolve=r);const pending=h.session.replayWinner({operationId,primaryCount:1,acceptedCount:1,usedCount:1});await flush();
  if(change==='hidden')h.setVisible(false);if(change==='offline')h.setOnline(false);h.session.environmentChanged(change);
  resolve({ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true});await pending;assert.equal(h.calls.length,9);assert.equal(h.session.snapshot().phase,'replay_blocked');assert.equal(h.session.snapshot().receipt,original);
 }
});
await test('final timer retains200ms gap,100ms dispatch lateness, and conservative identity response budget',async()=>{
 const h=harness();await h.session.calibrate(h.config);await h.advance(10900);assert.throws(()=>h.session.armRehearsal(new Date(h.wall()+1000).toISOString()),/insufficient_identity_budget/);assert.equal(h.calls.length,3);
 const x=harness();await x.session.calibrate(x.config);x.session.armRehearsal(new Date(x.wall()+1000).toISOString());await x.advance(900);await x.advance(196,{throttle:true});assert.equal(x.calls.length,3);assert.equal(x.session.snapshot().message,'late_dispatch');
});


await test('review regression: replay cancellation before actual command remains blocked through repeated lifecycle events',async()=>{
 const h=harness();const operationId=await plannedRace(h),original=h.session.snapshot().receipt;
 const unsubscribe=h.session.subscribe(()=>{if(h.session.snapshot().phase==='replay_in_flight')h.session.cancel('user_cancelled');});
 await h.session.replayWinner({operationId,primaryCount:1,acceptedCount:1,usedCount:1});unsubscribe();
 for(const reason of ['hidden','offline','pagehide','signout']){
  h.session.environmentChanged(reason);assert.equal(h.session.snapshot().phase,'replay_blocked');assert.equal(h.session.snapshot().receipt,original);assert.equal(h.calls.length,9);assert.equal(h.budget.used,9);
 }
});
await test('review regression: pending replay MFA blocked state remains stable and actual replay cancellation is uncertain',async()=>{
 const h=harness();const operationId=await plannedRace(h),original=h.session.snapshot().receipt;let resolve;
 h.port.mfa=()=>new Promise(r=>resolve=r);const work=h.session.replayWinner({operationId,primaryCount:1,acceptedCount:1,usedCount:1});await flush();
 h.session.environmentChanged('hidden');h.session.environmentChanged('offline');resolve({ok:true,userId:QA_ACTORS[0],aal2:true,hasVerifiedTotp:true});await work;
 assert.equal(h.session.snapshot().phase,'replay_blocked');assert.equal(h.session.snapshot().receipt,original);assert.equal(h.budget.used,9);
 const x=harness();const op=await plannedRace(x);x.port.command=c=>{x.calls.push(c);return new Promise(()=>{});};const pending=x.session.replayWinner({operationId:op,primaryCount:1,acceptedCount:1,usedCount:1});await flush();
 assert.equal(x.calls.length,10);x.session.environmentChanged('hidden');assert.equal(x.session.snapshot().phase,'uncertain');assert.equal(x.session.snapshot().receipt,null);await x.advance(4000);await pending;
});
await test('final dispatch checks timing after UI callbacks and before actual POST or budget consumption',async()=>{
 const h=harness();await h.session.calibrate(h.config);const target=new Date(h.wall()+1000).toISOString();
 const unsubscribe=h.session.subscribe(()=>{if(h.session.snapshot().phase==='in_flight')h.stall(101);});h.session.armRehearsal(target);await h.advance(1100);unsubscribe();
 assert.equal(h.calls.length,3);assert.equal(h.budget.used,3);assert.equal(h.session.snapshot().phase,'cancelled');assert.equal(h.session.snapshot().message,'late_dispatch');
 const x=harness();const operationId=await plannedRace(x),original=x.session.snapshot().receipt;const stop=x.session.subscribe(()=>{if(x.session.snapshot().phase==='replay_in_flight')x.stall(11001);});
 await x.session.replayWinner({operationId,primaryCount:1,acceptedCount:1,usedCount:1});stop();assert.equal(x.calls.length,9);assert.equal(x.budget.used,9);assert.equal(x.session.snapshot().phase,'replay_blocked');assert.equal(x.session.snapshot().message,'insufficient_identity_budget');assert.equal(x.session.snapshot().receipt,original);
});
await test('cancelling an attempted clock probe immediately records bounded numeric diagnostics and ignores late response',async()=>{
 const h=harness();let resolve;h.port.command=c=>{h.calls.push(c);return new Promise(r=>resolve=r);};const work=h.session.calibrate(h.config);await flush();await h.advance(200);h.session.cancel('user_cancelled');
 const diagnostic=h.session.snapshot().clockSamples;assert.equal(diagnostic.length,1);assert.equal(diagnostic[0].quality,'fatal');assert.equal(diagnostic[0].rttMs,200);assert.equal(diagnostic[0].wallDeltaMs,0);assert.equal(diagnostic[0].reason,'environment_changed');
 resolve({ok:false,reason:'unavailable'});await work;assert.equal(h.calls.length,1);assert.deepEqual(h.session.snapshot().clockSamples,diagnostic);assert.equal(h.session.snapshot().phase,'cancelled');
});

await test('review regression:4s invocation deadline stops replay before actual command despite delayed timeout callback',async()=>{
 for(const stall of [3999,4000]){
  const h=harness();const operationId=await plannedRace(h),original=h.session.snapshot().receipt;
  h.port.command=async c=>{h.calls.push(c);return {ok:true,events:[],qrText:null,secretUnavailable:true,replayed:true,receipt:wireReceipt(original)};};
  let stalled=false;const stop=h.session.subscribe(()=>{if(!stalled&&h.session.snapshot().phase==='replay_in_flight'){stalled=true;h.stall(stall);}});
  await h.session.replayWinner({operationId,primaryCount:1,acceptedCount:1,usedCount:1});stop();
  assert.equal(h.calls.length,stall===4000?9:10);assert.equal(h.budget.used,stall===4000?9:10);assert.equal(h.session.snapshot().phase,stall===4000?'replay_blocked':'replayed');
  if(stall===4000){assert.equal(h.session.snapshot().message,'response_timeout');assert.equal(h.session.snapshot().receipt,original);}
 }
});
await rm(dir,{recursive:true,force:true});
