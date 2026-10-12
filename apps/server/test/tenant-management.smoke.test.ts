import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function randomPort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('TCP port unavailable');
  return await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve(addr.port)));
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 4000))]);
}
test('MD-03.1: platform-only tenant directory, edit, suspension, sessions, reactivation and persistence', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metadrive-tenant-management-'));
  const port = await randomPort();
  const operatorEmail = 'tenant-portal-platform@example.test';
  const operatorPassword = 'PlatformPortalSmokeTest-2026!';
  const tenantPassword = 'InitialTenantSmokeTest-2026!';
  const developerPassword = 'TenantChosenDeveloperPassword-2026!';
  const bootstrapKey = 'tenant-management-platform-bootstrap-2026';
  const base = 'http://127.0.0.1:' + port + '/api';
  const env = {
    ...process.env,
    PORT: String(port), NODE_ENV: 'test', METADRIVE_TEST_MODE: 'true',
    METADRIVE_DATA_PATH: path.join(dir, 'state.json'),
    METADRIVE_BOOTSTRAP_TENANT_ID: 'platform-owner',
    METADRIVE_BOOTSTRAP_TENANT_NAME: 'Platform Owner',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL: operatorEmail,
    METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: operatorPassword,
    METADRIVE_PLATFORM_BOOTSTRAP_EMAIL: operatorEmail,
    METADRIVE_PLATFORM_BOOTSTRAP_KEY: bootstrapKey
  };
  let child: ChildProcess | null = null;
  let logs = '';
  const start = async () => {
    child = spawn(process.execPath, [tsxCli, 'src/index.ts'], { cwd, env, stdio: ['ignore','pipe','pipe'] });
    child.stdout?.on('data', (d: Buffer) => { logs += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { logs += d.toString(); });
    for (let i = 0; i < 300; i++) {
      if (child.exitCode !== null) throw new Error('Server failed to start: ' + logs);
      try {
        if ((await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(500) })).ok) return;
      } catch { /* starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Server did not start: ' + logs);
  };
  const api = async (route: string, token = '', method = 'GET', body?: unknown, bootstrap = false, cookie = '', idemKey = '') => {
    const response = await fetch(base + route, {
      method, headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(bootstrap ? { 'x-platform-bootstrap-key': bootstrapKey } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(idemKey ? { 'Idempotency-Key': idemKey } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const raw = await response.text();
    return { status: response.status, data: raw ? JSON.parse(raw) as Record<string, any> : {},
      cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' };
  };
  try {
    await start();
    assert.equal((await api('/platform/tenants')).status, 401);
    let login = await api('/auth/login', '', 'POST', { email: operatorEmail, password: operatorPassword });
    assert.equal(login.status, 200);
    const operatorToken = String(login.data.access_token);
    assert.equal((await api('/platform/tenants', operatorToken)).status, 403);
    assert.equal((await api('/platform/policies/bootstrap', operatorToken, 'POST', {}, true)).status, 200);
    assert.equal((await api('/platform/tenants', operatorToken)).status, 200);
    assert.equal((await api('/platform/tenants/platform-owner/suspend', operatorToken, 'POST', {})).status, 409,
      'Cannot suspend the only platform-superadmin tenant');
    const body = { tenantId: 'studio-beta', tenantName: 'Studio Beta', adminName: 'Studio Administrator',
      email: 'tenant-portal-admin@example.test', password: tenantPassword,
      developerDomain: 'studio-beta.test' };
    assert.equal((await api('/platform/tenants', operatorToken, 'POST', { ...body, superadmin: true })).status, 400,
      'Unknown privilege escalation fields must fail validation');
    const idem = 'md03-2-create-studio-beta-retry';
    const created = await api('/platform/tenants', operatorToken, 'POST', body, false, '', idem);
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.replayed, false);
    assert.equal(created.data.tenant.provisioning.status, 'READY');
    assert.equal(created.data.tenant.provisioning.version, 1);
    const retry = await api('/platform/tenants', operatorToken, 'POST', body, false, '', idem);
    assert.equal(retry.status, 200, JSON.stringify(retry.data));
    assert.equal(retry.data.replayed, true);
    assert.equal(retry.data.tenant.userCount, 2, 'Retry must not add duplicate developer or admin users');
    assert.equal(created.data.tenant.developerAccount.email, 'developer@studio-beta.test');
    assert.equal(created.data.tenant.developerAccount.activated, false);
    assert.equal((await api('/platform/tenants', operatorToken, 'POST',
      { ...body, tenantId: 'another-tenant' }, false, '', idem)).status, 409,
      'The same request key must not create a different tenant');
    assert.equal((await api('/platform/tenants', operatorToken, 'POST', body, false, '', 'bad')).status, 400);
    const readiness = await api('/platform/tenants/studio-beta/provisioning', operatorToken);
    assert.equal(readiness.status, 200);
    assert.ok(readiness.data.initialized.objects >= 3);
    assert.ok(readiness.data.initialized.profiles >= 1);
    assert.ok(readiness.data.initialized.permissionSets >= 1);
    assert.equal(readiness.data.initialized.initialAdministrator, true);
    assert.equal(readiness.data.initialized.developerAccount.email, 'developer@studio-beta.test');
    assert.equal(readiness.data.initialized.developerAccount.activated, false);
    assert.equal((await api('/platform/tenants/studio-beta/provisioning')).status, 401);
    assert.equal((await api('/platform/tenants/not-here/provisioning', operatorToken)).status, 404);
    assert.equal(created.data.tenant.name, 'Studio Beta');
    assert.equal(created.data.tenant.status, 'ACTIVE');
    assert.ok(!JSON.stringify(created.data).includes(tenantPassword));
    assert.equal((await api('/platform/tenants', operatorToken, 'POST', body)).status, 409);
    assert.equal((await api('/platform/tenants?q=studio&page=1&pageSize=10', operatorToken)).data.total, 1);
    assert.equal((await api('/platform/tenants?status=SUSPENDED', operatorToken)).data.total, 0);
    assert.equal((await api('/platform/tenants?status=bogus', operatorToken)).status, 400);
    assert.equal((await api('/platform/tenants?section=users&pageSize=999', operatorToken)).status, 400);
    assert.equal((await api('/platform/tenants/not-here', operatorToken)).status, 404);
    const detail = await api('/platform/tenants/studio-beta', operatorToken);
    assert.equal(detail.data.tenant.userCount, 2);
    const updated = await api('/platform/tenants/studio-beta', operatorToken, 'PATCH', { name: 'Studio Beta Updated', description: 'Client workspace' });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.tenant.description, 'Client workspace');
    assert.equal((await api('/platform/tenants/studio-beta', operatorToken, 'PATCH', { status: 'ACTIVE' })).status, 400);
    login = await api('/auth/login', '', 'POST', { email: body.email, password: tenantPassword });
    assert.equal(login.status, 200);
    const tenantToken = String(login.data.access_token);
    const tenantRefreshCookie = login.cookie;
    // MD-03.5: tenant owner and platform scopes, DNS proof, global uniqueness,
    // and durable pending verification all use the existing tenant registry.
    assert.equal((await api('/tenant/domains')).status, 401);
    assert.equal((await api('/platform/tenants/studio-beta/domains', tenantToken)).status, 403);
    assert.equal((await api('/platform/tenants/studio-beta/domains', operatorToken)).status, 200);
    assert.equal((await api('/tenant/domains', tenantToken, 'POST', { hostname: 'http://not-a-domain.example' })).status, 400);
    assert.equal((await api('/tenant/domains', tenantToken, 'POST', { hostname: 'localhost' })).status, 400);
    const claimedDomain = await api('/tenant/domains', tenantToken, 'POST', { hostname: 'CRM.STUDIO-BETA.TEST' });
    assert.equal(claimedDomain.status, 201, JSON.stringify(claimedDomain.data));
    assert.equal(claimedDomain.data.domain.hostname, 'crm.studio-beta.test');
    assert.equal(claimedDomain.data.domain.status, 'PENDING');
    assert.equal(claimedDomain.data.domain.verification.host, '_metadrive-verification.crm.studio-beta.test');
    assert.match(claimedDomain.data.domain.verification.value, /^metadrive-verification=[0-9a-f]{64}$/);
    assert.equal((await api('/tenant/domains', tenantToken)).data.domains.length, 1);
    assert.equal((await api('/tenant/domains', tenantToken, 'POST', { hostname: 'crm.studio-beta.test' })).status, 409);
    assert.equal((await api('/platform/tenants/platform-owner/domains', operatorToken,
      'POST', { hostname: 'crm.studio-beta.test' })).status, 409, 'Another tenant cannot claim a pending domain');
    assert.equal((await api('/platform/tenants/studio-beta/domains', operatorToken)).data.domains[0].status, 'PENDING');
    assert.equal((await api('/tenant/domains/not-owned.example', tenantToken, 'DELETE')).status, 404);
    assert.equal((await api('/tenant/developer-account')).status, 401);
    const beforeDeveloper = await api('/tenant/developer-account', tenantToken);
    assert.equal(beforeDeveloper.status, 200, JSON.stringify(beforeDeveloper.data));
    assert.equal(beforeDeveloper.data.email, 'developer@studio-beta.test');
    assert.equal(beforeDeveloper.data.seeded, true);
    assert.equal(beforeDeveloper.data.activated, false);
    assert.equal(beforeDeveloper.data.active, false);
    assert.equal((await api('/auth/login', '', 'POST', {
      email: beforeDeveloper.data.email, password: tenantPassword
    })).status, 401, 'The platform-known administrator password must not unlock the developer');
    assert.equal((await api('/tenant/developer-account/activate', tenantToken, 'POST', {
      password: 'short'
    })).status, 400);
    const activated = await api('/tenant/developer-account/activate', tenantToken, 'POST', {
      password: developerPassword
    });
    assert.equal(activated.status, 200, JSON.stringify(activated.data));
    assert.equal(activated.data.userId, beforeDeveloper.data.userId);
    assert.equal((await api('/tenant/developer-account/activate', tenantToken, 'POST', {
      password: 'AnotherTenantPassword-2026!'
    })).status, 409, 'Activation must never become an ongoing password override');
    const developerLogin = await api('/auth/login', '', 'POST', {
      email: beforeDeveloper.data.email, password: developerPassword
    });
    assert.equal(developerLogin.status, 200, JSON.stringify(developerLogin.data));
    const developerToken = String(developerLogin.data.access_token);
    assert.equal((await api('/auth/me', developerToken)).status, 200);
    assert.equal((await api('/platform/tenants', developerToken)).status, 403,
      'Developer never receives platform administration permissions');
    assert.equal((await api('/platform/tenants', tenantToken)).status, 403);
    assert.equal((await api('/platform/tenants/studio-beta/provisioning', tenantToken)).status, 403);
    assert.equal((await api('/tenant/developer-account', operatorToken)).status, 200,
      'Platform operator can view only their OWN tenant seeder, not studio-beta');
    assert.equal((await api('/platform/tenants/studio-beta/suspend', tenantToken, 'POST', {})).status, 403);
    assert.equal((await api('/auth/me', tenantToken)).status, 200);
    assert.equal((await api('/platform/tenants/studio-beta/suspend', operatorToken, 'POST', {})).status, 200);
    assert.equal((await api('/auth/me', tenantToken)).status, 401, 'Existing access token must be blocked');
    assert.equal((await api('/auth/me', developerToken)).status, 401,
      'Developer must obey the same tenant suspension policy');
    assert.equal((await api('/auth/refresh', '', 'POST', undefined, false, tenantRefreshCookie)).status, 401,
      'Suspension revokes refresh tokens');
    assert.equal((await api('/auth/login', '', 'POST', { email: body.email, password: tenantPassword })).status, 401);
    assert.equal((await api('/platform/tenants?status=SUSPENDED', operatorToken)).data.total, 1);
    const resumed = await api('/platform/tenants/studio-beta/reactivate', operatorToken, 'POST', {});
    assert.equal(resumed.status, 200);
    assert.equal(resumed.data.tenant.status, 'ACTIVE');
    assert.equal((await api('/auth/refresh', '', 'POST', undefined, false, tenantRefreshCookie)).status, 401,
      'Reactivation does not restore revoked sessions');
    assert.equal((await api('/auth/me', tenantToken)).status, 401,
      'Pre-suspension access tokens must not revive after reactivation');
    const freshLogin = await api('/auth/login', '', 'POST', { email: body.email, password: tenantPassword });
    assert.equal(freshLogin.status, 200);
    assert.equal((await api('/auth/me', String(freshLogin.data.access_token))).status, 200,
      'New login must be usable even if reactivation happened within the same second');
    const afterResumption = await api('/auth/login', '', 'POST', {
      email: 'developer@studio-beta.test', password: developerPassword
    });
    assert.equal(afterResumption.status, 200);
    const afterActivationStatus = await api('/tenant/developer-account', String(freshLogin.data.access_token));
    assert.equal(afterActivationStatus.data.activated, true);
    const disabledDeveloper = await api('/records/User/' + encodeURIComponent(beforeDeveloper.data.userId),
      String(freshLogin.data.access_token), 'PUT', { IsActive: false });
    assert.equal(disabledDeveloper.status, 200, JSON.stringify(disabledDeveloper.data));
    assert.equal((await api('/auth/me', String(afterResumption.data.access_token))).status, 401,
      'Tenant-admin deactivation must revoke developer access');
    assert.equal((await api('/tenant/developer-account/activate', String(freshLogin.data.access_token),
      'POST', { password: developerPassword })).status, 409,
      'Seeder activation must not override tenant revocation');
    assert.equal((await api('/platform/tenants/studio-beta/reactivate', operatorToken, 'POST', {})).status, 409);
    await stop(child!);
    await start();
    const newLogin = await api('/auth/login', '', 'POST', { email: operatorEmail, password: operatorPassword });
    assert.equal(newLogin.status, 200);
    const persisted = await api('/platform/tenants/studio-beta', String(newLogin.data.access_token));
    assert.equal(persisted.status, 200);
    const persistentRetry = await api('/platform/tenants', String(newLogin.data.access_token), 'POST',
      body, false, '', idem);
    assert.equal(persistentRetry.status, 200);
    assert.equal(persistentRetry.data.replayed, true);
    assert.equal(persistentRetry.data.tenant.userCount, 2);
    assert.equal(persistentRetry.data.tenant.developerAccount.activated, true);
    const persistedDeveloperStatus = await api('/tenant/developer-account',
      String((await api('/auth/login', '', 'POST', { email: body.email, password: tenantPassword })).data.access_token));
    assert.equal(persistedDeveloperStatus.data.active, false);
    assert.equal(persistedDeveloperStatus.data.activated, true);
    const createdSecond = await api('/platform/tenants', String(newLogin.data.access_token), 'POST', {
      tenantId: 'studio-gamma', tenantName: 'Studio Gamma', adminName: 'New Administrator',
      email: 'gamma-admin@example.test', password: tenantPassword
    });
    assert.equal(createdSecond.status, 201, JSON.stringify(createdSecond.data));
    assert.equal((await api('/auth/login', '', 'POST', { email: 'gamma-admin@example.test', password: tenantPassword })).status, 200);
    // Same tenant and request key concurrently must yield exactly one creation.
    const concurrentBody = {
      tenantId: 'parallel-studio', tenantName: 'Parallel Studio', adminName: 'Parallel Admin',
      email: 'parallel-admin@example.test', password: tenantPassword
    };
    const [parallelA, parallelB] = await Promise.all([
      api('/platform/tenants', String(newLogin.data.access_token), 'POST', concurrentBody,
        false, '', 'parallel-studio-idem-1234'),
      api('/platform/tenants', String(newLogin.data.access_token), 'POST', concurrentBody,
        false, '', 'parallel-studio-idem-1234')
    ]);
    assert.deepEqual([parallelA.status, parallelB.status].sort(), [200, 201]);
    assert.equal(parallelA.data.tenant.userCount, 2);
    assert.equal(parallelB.data.tenant.userCount, 2);
    const competingEmail = 'shared-unique-admin@example.test';
    const [raceA, raceB] = await Promise.all(['race-a-studio', 'race-b-studio'].map((tenantId) =>
      api('/platform/tenants', String(newLogin.data.access_token), 'POST', {
        tenantId, tenantName: tenantId, adminName: 'Competing Admin',
        email: competingEmail, password: tenantPassword
      })
    ));
    assert.deepEqual([raceA.status, raceB.status].sort(), [201, 409],
      'Concurrent tenants must not create two identities with the same email');
    const durableDomain = await api('/platform/tenants/studio-beta/domains', String(newLogin.data.access_token));
    assert.equal(durableDomain.status, 200);
    assert.equal(durableDomain.data.domains[0].hostname, 'crm.studio-beta.test');
    assert.equal(durableDomain.data.domains[0].verification.value, claimedDomain.data.domain.verification.value);
    assert.equal((await api('/platform/tenants/studio-beta/domains/crm.studio-beta.test',
      String(newLogin.data.access_token), 'DELETE')).status, 200);
    assert.deepEqual((await api('/platform/tenants/studio-beta/domains',
      String(newLogin.data.access_token))).data.domains, []);
    assert.equal(persisted.data.tenant.name, 'Studio Beta Updated');
    assert.equal(persisted.data.tenant.status, 'ACTIVE');
  } finally {
    if (child) await stop(child);
    await rm(dir, { recursive: true, force: true });
  }
});
