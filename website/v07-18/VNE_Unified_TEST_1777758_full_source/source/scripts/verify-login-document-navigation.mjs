// Run from the TEST checkout after the document-navigation patch is applied.
// Evaluate the actual UI navigation expression, then pass that document URL to the guard.
// No network, credentials, real accounts or factor mutations.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const root=process.cwd();
const {default:guard,TEST_ORIGIN,TEST_SUPABASE,TEST_PROJECT}=await import(pathToFileURL(path.join(root,'test-stand/guard.mjs')));
const ui=await readFile(path.join(root,'test-stand/routes/login.tsx'),'utf8');
const expression=ui.match(/if \(result\.ok\) (window\.location\.assign\(result\.redirect \|\| "\/apply"\));/);
assert.ok(expression,'successful TEST login must use document navigation with unchanged server target');
assert.equal(ui.includes('useNavigate'),false,'login must not bypass the document guard through SPA navigation');
const admin='02e03845-bc0d-4a9b-8500-87bb1f11ccf6',scanner='1e7259c2-ad13-43a1-b34b-cba71533e844';
const env={VNE_TEST_AUTH_MODE:'supabase-synthetic',VNE_TEST_VARIANT:'questionnaire-only',VNE_AUTH_ENV:'staging',VNE_SITE_URL:TEST_ORIGIN,VNE_SUPABASE_URL:TEST_SUPABASE,VNE_MEMBERSHIP_QUESTIONNAIRE:'test',VNE_DELIVERY_MODE:'disabled',VNE_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',VNE_TEST_ADMIN_MFA:'enabled',VNE_TEST_SCANNER_MFA:'enabled'};
for(const [userId,target,status] of [[scanner,'/admin/mfa',403],[admin,'/scanner/mfa',403],[scanner,'/scanner/mfa',200],[admin,'/admin/mfa',200]]) {
 let destination,dispatched=0;
 runInNewContext(expression[1],{result:{ok:true,redirect:target},window:{location:{assign(value){destination=value;}}}});
 assert.equal(destination,target,'no broad redirect or alternate authorization destination');
 const worker=guard({fetch:async()=>{dispatched++;return new Response('permitted');}},{projectId:TEST_PROJECT,functions:{},assets:[]},async()=>({allowed:true,userId,cookies:[]}));
 const response=await worker.fetch(new Request(TEST_ORIGIN+destination),env,{});
 assert.equal(response.status,status);
 if(status===403){assert.equal(dispatched,0);assert.match(await response.text(),/Сменить аккаунт/);assert.equal(response.headers.get('cache-control'),'private, no-store');}
 else assert.equal(dispatched,1);
}
console.log(JSON.stringify({status:'PASS',documentNavigation:true,wrongTargetShows403Guidance:true,correctTargetsPreserved:true,network:'none'}));
