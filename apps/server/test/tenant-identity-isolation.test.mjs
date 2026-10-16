import assert from 'node:assert/strict';
import test from 'node:test';
import { assertTenantIdentityIsolation } from '../src/tenant-identity-isolation.mjs';

function state() {
  const id=(id,tenantId,email)=>({id,tenantId,email});
  return {
    tenants: {
      alpha: {accessControl:{users:[{id:'a'}]}},
      beta: {accessControl:{users:[{id:'b'}]}}
    },
    users:[id('a','alpha','first@example.test'),id('b','beta','second@example.test')],
    refreshSessions:[
      {tokenHash:'one',userId:'a',tenantId:'alpha',revokedAt:null,usedAt:null},
      {tokenHash:'two',userId:'b',tenantId:'beta',revokedAt:null,usedAt:null}
    ]
  };
}
test('MD-03.4: independent tenants and matching sessions are valid',()=>{
  assert.equal(assertTenantIdentityIsolation(state()),true);
});
test('MD-03.4: a session may not switch to another tenant',()=>{
  const s=state();s.refreshSessions[0].tenantId='beta';
  assert.throws(()=>assertTenantIdentityIsolation(s),/session identity belongs to another tenant/);
});
test('MD-03.4: tenant access control may not reference another tenant user',()=>{
  const s=state();s.tenants.alpha.accessControl.users.push({id:'b'});
  assert.throws(()=>assertTenantIdentityIsolation(s),/access-control user belongs to another tenant/);
});
test('MD-03.4: a user and active session must belong to a registered tenant',()=>{
  const s=state();s.users[0].tenantId='missing';
  assert.throws(()=>assertTenantIdentityIsolation(s),/user references a missing tenant/);
  const t=state();t.refreshSessions[0].tenantId='missing';
  assert.throws(()=>assertTenantIdentityIsolation(t),/session references a missing tenant/);
  const u=state();u.refreshSessions[0].userId='not-found';
  assert.throws(()=>assertTenantIdentityIsolation(u),/active session has no owning user/);
});
test('MD-03.4: historical revoked session can remain after user deletion',()=>{
  const s=state();s.users=s.users.filter(u=>u.id!=='a');
  s.tenants.alpha.accessControl.users=[];
  s.refreshSessions[0].revokedAt=1;
  assert.equal(assertTenantIdentityIsolation(s),true);
});
test('MD-03.4: duplicate users, emails and invalid ACL shapes fail closed',()=>{
  const s=state();s.users.push({...s.users[0]});
  assert.throws(()=>assertTenantIdentityIsolation(s),/duplicate user identity/);
  const t=state();t.users[1].email='FIRST@example.test';
  assert.throws(()=>assertTenantIdentityIsolation(t),/duplicate or missing user email/);
  const u=state();u.tenants.beta.accessControl.users={id:'b'};
  assert.throws(()=>assertTenantIdentityIsolation(u),/invalid access-control identities/);
});

test('MD-03.4: orphan or duplicated access-control assignments cannot enter a snapshot',()=>{
  const orphan=state();
  orphan.tenants.alpha.accessControl.users.push({id:'unregistered'});
  assert.throws(()=>assertTenantIdentityIsolation(orphan),/no tenant identity/);
  const duplicate=state();
  duplicate.tenants.alpha.accessControl.users.push({id:'a'});
  assert.throws(()=>assertTenantIdentityIsolation(duplicate),/duplicate access-control user identity/);
  const invalid=state();
  invalid.tenants.alpha.accessControl.users.push({id:''});
  assert.throws(()=>assertTenantIdentityIsolation(invalid),/invalid access-control user identity/);
});
