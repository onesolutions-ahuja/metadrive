import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('offline metadata publication is authenticated, scoped and integrity checked',()=>{
 const source=readFileSync(new URL('../../src/system-support/server.ts',import.meta.url),'utf8');
 const auth=source.indexOf("app.use('/api',authorize)");
 const start=source.indexOf("app.get('/api/metadata/offline-publication'");
 const end=source.indexOf("app.get('/api/metadata/components'",start);
 assert.ok(auth>=0&&start>auth&&end>start);
 const handler=source.slice(start,end);
 for(const check of ['ObjectDefinition','PageDefinition','ComponentDefinition',
   'actor.tenant_id','permittedApps','sha256','no-store','verifiedDigest','minimumVersion']){
  assert.ok(handler.includes(check),check);
 }
 assert.doesNotMatch(handler,/md_records|md_record_values|md_sessions/);
});
