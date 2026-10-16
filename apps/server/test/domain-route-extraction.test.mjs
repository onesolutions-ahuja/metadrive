import assert from 'node:assert/strict';
import test from 'node:test';
import { registerAppsMetadataRoutes } from '../src/modules/apps/metadata-routes.ts';
import { registerSecurityCurrencyRoutes } from '../src/modules/security/currency-routes.ts';

function harness(register, services) {
  const routes = new Map();
  const app = Object.fromEntries(['get', 'post', 'put', 'delete'].map(method => [
    method, (url, ...handlers) => routes.set(`${method} ${url}`, handlers)
  ]));
  const requirePermission = permission => (_req, res, next) =>
    res.locals.principal.permissions.includes(permission)
      ? next() : res.status(403).json({ error: 'Permission denied' });
  register(Object.defineProperties({ app, requirePermission, requireAnyPermission: requirePermission,
    getPrincipal: res => res.locals.principal }, Object.getOwnPropertyDescriptors(services)));
  return (key, principal, body) => {
    const res = {
      locals: { principal }, statusCode: 200, body: undefined,
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; return this; }
    };
    const handlers = routes.get(key);
    assert.ok(handlers, `Missing route: ${key}`);
    let position = 0;
    const next = () => handlers[position++]({ body }, res, next);
    next();
    return res;
  };
}

test('app discovery enforces metadata permission before reading tenant data', () => {
  const request = harness(registerAppsMetadataRoutes, {
    tenantData() { assert.fail('Denied requests must not read a tenant'); }
  });
  assert.equal(request('get /api/metadata/apps', {
    tenantId: 'a', permissions: []
  }).statusCode, 403);
});

test('app discovery filters apps and object navigation using the current tenant', () => {
  const makeApp = apiName => ({ apiName, navigationItems: ['Account', 'Secret'],
    navigationOrder: [{ type: 'Object', apiName: 'Secret' }, { type: 'Page', apiName: 'Home' }] });
  let tenants = { a: { apps: [makeApp('Allowed'), makeApp('Hidden')] }, b: { apps: [makeApp('OtherTenant')] } };
  const request = harness(registerAppsMetadataRoutes, {
    tenantData: id => tenants[id],
    canOpenApp: (_principal, _tenant, name) => name !== 'Hidden',
    canOpenTab: (_principal, _tenant, name) => name !== 'Secret'
  });
  const principal = { tenantId: 'a', permissions: ['metadata:read'] };
  const first = request('get /api/metadata/apps', principal).body.apps;
  assert.deepEqual(first.map(app => app.apiName), ['Allowed']);
  assert.deepEqual(first[0].navigationItems, ['Account']);
  assert.deepEqual(first[0].navigationOrder, [{ type: 'Page', apiName: 'Home' }]);
  assert.equal(tenants.a.apps[0].navigationItems.length, 2);
  tenants = { ...tenants, a: { apps: [makeApp('Replacement')] } };
  assert.equal(request('get /api/metadata/apps', principal).body.apps[0].apiName, 'Replacement');
  assert.equal(request('get /api/metadata/apps', { ...principal, tenantId: 'b' }).body.apps[0].apiName, 'OtherTenant');
});

test('successive metadata writes update shared state and preserve concurrent tenant changes', () => {
  let state = { tenants: { a: { apps: [], objects: [], pages: [] }, b: { marker: 'original' } } };
  const commits = [];
  const request = harness(registerAppsMetadataRoutes, {
    get state() { return state; },
    set state(next) { state = next; },
    tenantData: id => state.tenants[id],
    lightningAppSchema: { safeParse: data => ({ success: true, data }) },
    persistState: next => commits.push(next)
  });
  const principal = { tenantId: 'a', permissions: ['metadata:write'] };
  const app = { apiName: 'First', navigationItems: [], navigationPageApiNames: [] };
  assert.equal(request('post /api/metadata/apps', principal, app).statusCode, 201);
  state = { ...state, tenants: { ...state.tenants, b: { marker: 'concurrent update' } } };
  assert.equal(request('post /api/metadata/apps', principal, { ...app, apiName: 'Second' }).statusCode, 201);
  assert.deepEqual(state.tenants.a.apps.map(app => app.apiName), ['First', 'Second']);
  assert.equal(state.tenants.b.marker, 'concurrent update');
  assert.equal(commits.length, 2);
  assert.strictEqual(commits[1], state);
});

test('currency writes deny read-only callers and reject currencies assigned to users or records', () => {
  let tenant = { currencySettings: {}, accessControl: { users: [{ username: 'Owner', currencyIsoCode: 'USD' }] },
    objects: [{ apiName: 'Invoice', fields: [{ dataType: 'Currency(16,2)' }] }], records: {} };
  const request = harness(registerSecurityCurrencyRoutes, {
    tenantData: () => tenant,
    currencySettingsSchema: { safeParse: data => ({ success: true, data }) },
    persistTenantRecords() { assert.fail('Rejected currency changes must not persist'); }
  });
  const principal = { tenantId: 'a', permissions: ['security:read'] };
  const settings = { currencies: [{ currencyIsoCode: 'GBP' }] };
  assert.equal(request('put /api/metadata/currencies', principal, settings).statusCode, 403);
  principal.permissions.push('security:manage');
  assert.match(request('put /api/metadata/currencies', principal, settings).body.error, /assigned to user/);
  tenant = { ...tenant, accessControl: { users: [] }, records: { Invoice: [{ Id: 'one', CurrencyIsoCode: 'USD' }] } };
  const result = request('put /api/metadata/currencies', principal, settings);
  assert.equal(result.statusCode, 409);
  assert.match(result.body.error, /Invoice record "one"/);
});

test('currency writes validate input and persist only the authenticated tenant', () => {
  const tenants = { a: { currencySettings: {}, accessControl: { users: [] }, objects: [], records: {} },
    b: { currencySettings: { untouched: true } } };
  const request = harness(registerSecurityCurrencyRoutes, {
    tenantData: id => tenants[id],
    currencySettingsSchema: { safeParse: data => data?.currencies
      ? { success: true, data } : { success: false, error: { flatten: () => ({}) } } },
    persistTenantRecords: (id, tenant) => { tenants[id] = tenant; }
  });
  const principal = { tenantId: 'a', permissions: ['security:manage', 'security:read'] };
  assert.equal(request('put /api/metadata/currencies', principal, {}).statusCode, 400);
  const settings = { currencies: [{ currencyIsoCode: 'GBP' }] };
  assert.deepEqual(request('put /api/metadata/currencies', principal, settings).body, settings);
  assert.deepEqual(request('get /api/metadata/currencies', principal).body, settings);
  assert.deepEqual(tenants.b.currencySettings, { untouched: true });
});
