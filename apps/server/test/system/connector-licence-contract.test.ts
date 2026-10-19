import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('connector licence admin is tenant-scoped and does not auto-install',()=>{
 const source=readFileSync(new URL('../../src/system-support/server.ts',import.meta.url),'utf8');
 const start=source.indexOf("app.post('/api/connector-apps/:appKey/licence'");
 const end=source.indexOf("app.post('/api/apps/:apiName/install'",start);
 assert.ok(start>0 && end>start);
 const body=source.slice(start,end);
 for(const check of ["'Licence','manage'","'AppExchange','manage'","actor.tenant_id",
  "md_app_entitlements","ON CONFLICT(tenant_id,app_id)","md_security_events"]){
  assert.ok(body.includes(check),check);
 }
 assert.ok(!body.includes("md_app_installations"),'licensing must not imply installation');
});
