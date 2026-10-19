import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

test('user account locks require tenant security permissions, revoke sessions, and audit',()=>{
 const code=readFileSync(new URL('../../src/system-support/server.ts',import.meta.url),'utf8');
 const start=code.indexOf('const setAccountLock=route('),end=code.indexOf("app.get('/api/auth/security-events'",start);
 assert.ok(start>0&&end>start);
 const body=code.slice(start,end);
 for(const fragment of [
  "'Security','manage'","'Cannot alter own account lock'","WHERE tenant_id=$1 AND id=$2",
  "'md_sessions','md_refresh_sessions'","revoked_at=now()","INSERT INTO md_security_events",
  "app.post('/api/auth/users/:id/lock'","app.post('/api/auth/users/:id/unlock'"
 ])assert.ok(body.includes(fragment),fragment);
});
