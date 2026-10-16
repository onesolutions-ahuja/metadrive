import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPlatformStateStore } from '../src/core/state/store.ts';
import { createSqlStateRefresh } from '../src/core/state/refresh.ts';
import { createDurableAuthOverlay } from '../src/core/state/auth-overlay.ts';
import { createPersistedMetadataReadMode } from '../src/core/state/metadata-read-mode.ts';
import { createPersistenceResponseBarrier } from '../src/core/state/response-barrier.ts';
import { createTenantDataService } from '../src/core/state/tenant-data.ts';
import { initializePlatformState } from '../src/core/state/initialization.ts';

function snapshot() {
  return { tenantRegistry: { a: { status: 'ACTIVE' }, b: { status: 'ACTIVE' } },
    tenantManagementAudit: [], platformPolicies: {}, platformPolicyAudit: [], libraryComponents: [],
    tenants: { a: { securityAudit: [], records: {}, objects: [], autoNumberSequences: {}, accessControl: { users: [{ id: 'u' }] } },
      b: { securityAudit: [], records: {}, objects: [], autoNumberSequences: {}, accessControl: { users: [] } } },
    users: [{ id: 'u', tenantId: 'a', email: 'owner@example.test' }],
    refreshSessions: [], revokedAccessTokens: {} };
}
function temporaryPath(t) {
  const directory = mkdtempSync(join(tmpdir(), 'metadrive-core-state-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return join(directory, 'state.json');
}
function store(t, options = {}) {
  const value = createPlatformStateStore({ maintenance: false, persistenceMode: 'typed',
    dataPath: temporaryPath(t), persistToPostgres: async () => {}, ...options });
  value.state = snapshot();
  return value;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('typed persistence exposes the exact SQL commit and never writes a local snapshot', async t => {
  const path = temporaryPath(t), commit = deferred(), writes = [];
  const value = store(t, { dataPath: path, persistToPostgres: (state, serialized) => {
    writes.push([state, JSON.parse(serialized)]); return commit.promise;
  } });
  const next = value.state;
  value.persistState(next);
  assert.strictEqual(value.latestCommit, commit.promise);
  assert.strictEqual(writes[0][0], next);
  assert.deepEqual(writes[0][1], next);
  assert.equal(existsSync(path), false);
  assert.equal(existsSync(path + '.tmp'), false);
  commit.resolve();
  await value.latestCommit;
});

test('maintenance and cross-tenant identity violations fail before any write', t => {
  let writes = 0;
  const value = store(t, { persistToPostgres: async () => { writes++; } });
  assert.throws(() => value.persistState({ ...snapshot(), users: [{ id: 'u', tenantId: 'missing' }] }), /Tenant isolation/);
  const locked = store(t, { maintenance: true, persistToPostgres: async () => { writes++; } });
  assert.throws(() => locked.persistState(snapshot()), /maintenance/);
  assert.equal(writes, 0);
});

test('legacy JSONB cache and SQL payload omit refresh tokens without mutating memory', async t => {
  const path = temporaryPath(t);
  let sql;
  const value = store(t, { persistenceMode: 'jsonb', dataPath: path,
    persistToPostgres: async (_state, serialized) => { sql = JSON.parse(serialized); } });
  const state = snapshot();
  state.refreshSessions.push({ userId: 'u', tenantId: 'a', tokenHash: 'secret', usedAt: null, revokedAt: null });
  value.persistState(state);
  await value.latestCommit;
  assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')).refreshSessions, []);
  assert.deepEqual(sql.refreshSessions, []);
  assert.equal(state.refreshSessions.length, 1);
  assert.equal(existsSync(path + '.tmp'), false);
});

test('failed SQL commits remain rejected at the shared barrier', async t => {
  t.mock.method(console, 'error', () => {});
  const failure = new Error('unavailable');
  const value = store(t, { persistToPostgres: () => Promise.reject(failure) });
  value.persistState(value.state);
  await assert.rejects(value.latestCommit, failure);
});

for (const race of ['state', 'auth']) test(`SQL refresh refuses a concurrent ${race} write`, async t => {
  const value = store(t), before = value.state, read = deferred();
  let revision = 0, flushed = 0;
  const refresh = createSqlStateRefresh({ persistenceMode: 'typed', store: value,
    authRevision: () => revision, readPersistedState: () => read.promise,
    waitForPersistedState: async () => { flushed++; },
    parsePersistedPlatformState: raw => raw, restoreDurableAuthOverlay: raw => raw });
  const pending = refresh();
  if (race === 'state') value.latestCommit = Promise.resolve(); else revision++;
  read.resolve(snapshot());
  assert.equal(await pending, false);
  assert.strictEqual(value.state, before);
  assert.equal(flushed, 1);
});

test('SQL refresh applies verified state and overlay, and rejects missing snapshots', async t => {
  const value = store(t), next = snapshot();
  next.revokedAccessTokens.logout = 123;
  const base = { persistenceMode: 'typed', store: value, authRevision: () => 0,
    waitForPersistedState: async () => {}, parsePersistedPlatformState: raw => raw,
    restoreDurableAuthOverlay: raw => ({ ...raw, marker: 'overlay' }) };
  assert.equal(await createSqlStateRefresh({ ...base, readPersistedState: async () => next })(), true);
  assert.equal(value.state.marker, 'overlay');
  const before = value.state;
  await assert.rejects(createSqlStateRefresh({ ...base, readPersistedState: async () => null }), /verified SQL snapshot/);
  assert.strictEqual(value.state, before);
});

test('durable login/logout replay is tenant-scoped, idempotent and survives refresh', () => {
  const now = Date.now() / 1000;
  const login = { tokenHash: 'refresh', familyId: 'family', userId: 'u', tenantId: 'a',
    expiresAt: now + 3600, usedAt: null, revokedAt: null, mfaVerified: true, authVersion: 1,
    auditId: 'audit', auditAt: new Date().toISOString() };
  const overlay = createDurableAuthOverlay({ persistenceMode: 'typed',
    durableAuthLogins: [login, { ...login, tenantId: 'b', tokenHash: 'forged' },
      { ...login, expiresAt: now - 1, tokenHash: 'expired' }],
    durableLogouts: [{ jti: 'access', tenantId: 'a', userId: 'u', refreshHash: 'refresh',
      accessExpiresAt: now + 3600, refreshExpiresAt: now + 3600, revokedAt: now }] });
  const original = snapshot(), first = overlay.restoreDurableAuthOverlay(original);
  assert.equal(first.refreshSessions.length, 1);
  assert.equal(first.refreshSessions[0].revokedAt, now);
  assert.equal(first.tenants.a.securityAudit.length, 1);
  assert.equal(first.tenants.b.securityAudit.length, 0);
  assert.equal(first.revokedAccessTokens.access, now + 3600);
  assert.deepEqual(overlay.restoreDurableAuthOverlay(first), first);
  assert.equal(overlay.restoreDurableAuthOverlay(snapshot()).refreshSessions[0].revokedAt, now);
  assert.equal(original.refreshSessions.length, 0);
  overlay.authOverlayRevision++;
  assert.equal(overlay.authOverlayRevision, 1);
});

test('legacy parsing restores strict metadata validation after errors and nested reads', () => {
  const mode = createPersistedMetadataReadMode();
  assert.equal(mode.active, false);
  assert.throws(() => mode.parse({ parse() {
    assert.equal(mode.active, true);
    mode.parse({ parse() { assert.equal(mode.active, true); } });
    assert.equal(mode.active, true);
    throw Error('invalid snapshot');
  } }, {}), /invalid snapshot/);
  assert.equal(mode.active, false);
});

test('tenant reads honor provisioning and suspension; writes preserve other tenants and sequences', async t => {
  const value = store(t), pending = new Set(['a']);
  value.state.tenants.a.autoNumberSequences.Invoice = 9;
  const service = createTenantDataService({ platformStore: value, provisioningPendingTenants: pending,
    installableAppCatalog: { packages: [] }, bundledCustomComponentsPath: '', persistState: value.persistState });
  assert.equal(service.tenantData('a'), undefined);
  pending.clear();
  value.state.tenantRegistry.a.status = 'SUSPENDED';
  assert.equal(service.tenantData('a'), undefined);
  value.state.tenantRegistry.a.status = 'ACTIVE';
  const other = value.state.tenants.b;
  service.persistTenantRecords('a', { ...value.state.tenants.a, autoNumberSequences: { Invoice: 2 } });
  await value.latestCommit;
  assert.equal(service.tenantData('a').autoNumberSequences.Invoice, 9);
  assert.strictEqual(value.state.tenants.b, other);
});

function response() {
  return { locals: {}, headers: new Map(), bodies: [], statusCode: 200, headersSent: false,
    end(body) { this.bodies.push(body); },
    getHeader(name) { return this.headers.get(name); },
    setHeader(name, value) { this.headers.set(name, value); },
    removeHeader(name) { this.headers.delete(name); } };
}

test('HTTP write acknowledgement waits for SQL and fails closed on rejection', async t => {
  t.mock.method(console, 'error', () => {});
  const gate = deferred(), res = response();
  createPersistenceResponseBarrier({ persistenceMode: 'typed', latestCommit: gate.promise })(
    { path: '/api/records/Account', method: 'POST' }, res, () => {});
  res.end('saved');
  assert.equal(res.bodies.length, 0);
  gate.resolve();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(res.bodies, ['saved']);
  const failed = response();
  createPersistenceResponseBarrier({ persistenceMode: 'typed', latestCommit: Promise.reject(Error('SQL failed')) })(
    { path: '/api/records/Account', method: 'POST' }, failed, () => {});
  failed.end('saved');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(failed.statusCode, 503);
  assert.deepEqual(JSON.parse(failed.bodies[0]), { error: 'Database persistence unavailable' });
});

test('typed initialization refuses a missing SQL snapshot before seed or local writes', async t => {
  const path = temporaryPath(t), value = store(t);
  await assert.rejects(initializePlatformState({ platformStore: value, dataPath: path,
    maintenanceMode: false, loadState() { assert.fail('Must not seed typed state'); },
    installableAppCatalog: { packages: [] }, bundledCustomComponentsPath: '',
    persistence: { persistenceMode: 'typed', readPersistedState: async () => null,
      readDurableAuthLogins: async () => [], readAuthLogoutRevocations: async () => [],
      persistToPostgres() { assert.fail('Must not write an empty seed'); } } }), /verified database snapshot/);
  assert.equal(existsSync(path), false);
});

test('maintenance initialization loads SQL without auth, seed or persistence writes', async t => {
  t.mock.method(console, 'info', () => {});
  t.mock.method(console, 'warn', () => {});
  const path = temporaryPath(t), value = store(t), state = snapshot();
  const overlay = await initializePlatformState({ platformStore: value, dataPath: path,
    maintenanceMode: true, loadState: raw => { assert.strictEqual(raw, state); return raw; },
    installableAppCatalog: { packages: [] }, bundledCustomComponentsPath: '',
    persistence: { persistenceMode: 'typed', readPersistedState: async () => state,
      readDurableAuthLogins() { assert.fail('Maintenance must not initialize auth SQL'); },
      readAuthLogoutRevocations() { assert.fail('Maintenance must not initialize auth SQL'); },
      persistToPostgres() { assert.fail('Maintenance must not persist'); } } });
  assert.deepEqual(overlay.durableAuthLogins, []);
  assert.deepEqual(overlay.durableLogouts, []);
  assert.equal(existsSync(path), false);
  assert.deepEqual(value.state.tenants, state.tenants);
});

test('startup applies durable auth before its first SQL commit and preserves typed SQL-only behavior', async t => {
  t.mock.method(console, 'info', () => {});
  t.mock.method(console, 'warn', () => {});
  const path = temporaryPath(t), value = store(t), state = snapshot(), order = [];
  const now = Date.now() / 1000;
  await initializePlatformState({ platformStore: value, dataPath: path, maintenanceMode: false,
    loadState: raw => { order.push('hydrate'); return raw; },
    installableAppCatalog: { packages: [] }, bundledCustomComponentsPath: '',
    persistence: { persistenceMode: 'typed',
      readPersistedState: async () => { order.push('snapshot'); return state; },
      readDurableAuthLogins: async () => { order.push('logins'); return [{
        tokenHash: 'session', familyId: 'family', tenantId: 'a', userId: 'u',
        expiresAt: now + 3600, usedAt: null, revokedAt: null,
        auditId: 'login', auditAt: new Date().toISOString()
      }]; },
      readAuthLogoutRevocations: async () => { order.push('logouts'); return [{
        jti: 'revoked', tenantId: 'a', userId: 'u', refreshHash: 'session',
        accessExpiresAt: now + 3600, refreshExpiresAt: now + 3600, revokedAt: now
      }]; },
      persistToPostgres: async next => {
        order.push('persist');
        assert.strictEqual(next, value.state);
        assert.equal(next.refreshSessions[0].revokedAt, now);
        assert.equal(next.tenants.a.securityAudit[0].id, 'login');
      }
    } });
  assert.deepEqual(order, ['snapshot', 'hydrate', 'logins', 'logouts', 'persist']);
  assert.equal(existsSync(path), false);
});
