import test from 'node:test';
import assert from 'node:assert/strict';
import { installTenantRecoveryCentre } from '../src/tenant-recovery-centre.mjs';

function fakeApp() {
  const routes = [];
  return {
    routes,
    get(path, ...handlers) { routes.push({ method: 'GET', path, handlers }); },
    post(path, ...handlers) { routes.push({ method: 'POST', path, handlers }); }
  };
}
test('MD-03.7: all recovery entrypoints remain fail-closed without independent infrastructure', async () => {
  const app = fakeApp();
  const auth = () => { throw new Error('Test middleware must not run'); };
  installTenantRecoveryCentre(app, {
    auth, tenantAdmin: auth, platformAdmin: auth, principal: () => { throw new Error('Should not load principal'); },
    tenantUser: () => { throw new Error('Should not read tenant user'); },
    domains: () => [], freshMfa: undefined, pool: undefined, deliver: undefined,
    verifyDomain: undefined, applyRestrictedRepair: undefined
  });
  const required = [
    '/api/tenant/recovery/contacts',
    '/api/recovery/contacts/verify',
    '/api/platform/recovery/cases',
    '/api/recovery/cases/:caseId/confirm',
    '/api/recovery/cases/:caseId/dispute',
    '/api/platform/recovery/cases/:caseId/approve',
    '/api/platform/recovery/cases/:caseId/invite',
    '/api/tenant/recovery/cases/:caseId/redeem',
    '/api/tenant/recovery/cases/:caseId/repair'
  ];
  for (const path of required) {
    const route = app.routes.find(item => item.path === path);
    assert.ok(route, 'Missing recovery route: ' + path);
    const res = {
      statusCode: 200, headersSent: false, body: null,
      status(value) { this.statusCode = value; return this; },
      json(value) { this.body = value; this.headersSent = true; return this; }
    };
    await route.handlers.at(-1)({ body: { verified: true, mfaCode: '123456' }, params: { caseId: 'x' } }, res);
    assert.equal(res.statusCode, 503, 'Fail-closed route: ' + path);
    assert.equal(res.body.error, 'Verified tenant recovery is not configured');
  }
});
test('no privileged recovery action is registered without authentication middleware', () => {
  const app = fakeApp();
  const requireAuth = () => {};
  const requirePlatform = () => {};
  installTenantRecoveryCentre(app, {
    auth: requireAuth, platformAdmin: requirePlatform, tenantAdmin: () => {},
    pool: null, deliver: null, verifyDomain: null
  });
  for (const route of app.routes.filter(item => item.path.startsWith('/api/platform/recovery/'))) {
    assert.equal(route.handlers[0], requireAuth);
    assert.equal(route.handlers[1], requirePlatform);
  }
  for (const path of ['/api/tenant/recovery/cases/:caseId/redeem', '/api/tenant/recovery/cases/:caseId/repair']) {
    const route = app.routes.find(item => item.path === path);
    assert.equal(route.handlers[0], requireAuth);
  }
});

test('MD-03 production: even configured mail and MFA cannot bypass missing Aiven audit trigger', async () => {
  const app = fakeApp();
  const noOp = () => {};
  let queried = 0;
  installTenantRecoveryCentre(app, {
    auth: noOp, tenantAdmin: noOp, platformAdmin: noOp, principal: () => { throw Error('must not enter handler'); },
    tenantUser: () => { throw Error('must not inspect user'); }, domains: () => [],
    freshMfa: async () => ({ id: 'operator' }), applyRestrictedRepair: async () => {},
    pool: {query: async () => {queried++; return { rows: [{
      database_name: 'metadrive_recovery_control', role_name: 'avnadmin',
      elevated_role: true, recovery_tables: 8, owned_tables: 8,
      immutable_audit_triggers: 0, can_mutate_audit: true,
      can_create_schema_objects: true, can_create_database_objects: true
    }] }; }},
    deliver: async () => {}, verifyDomain: async () => true
  });
  const route = app.routes.find(x => x.path === '/api/platform/recovery/cases/:caseId/approve');
  const response = { statusCode: 200, status(code) {this.statusCode=code; return this;},
    json(payload) {this.body=payload; return this;} };
  await route.handlers.at(-1)({body:{mfaCode:'000000'},params:{caseId:'00000000-0000-0000-0000-000000000000'}},response);
  assert.equal(response.statusCode,503);
  assert.equal(response.body.error,'Recovery security controls are not ready');
  assert.equal(queried,1,'Database attestation must run before any handler');
});
