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
  const api = async (route: string, token = '', method = 'GET', body?: unknown, bootstrap = false, cookie = '') => {
    const response = await fetch(base + route, {
      method, headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(bootstrap ? { 'x-platform-bootstrap-key': bootstrapKey } : {}),
        ...(cookie ? { Cookie: cookie } : {})
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
      email: 'tenant-portal-admin@example.test', password: tenantPassword };
    assert.equal((await api('/platform/tenants', operatorToken, 'POST', { ...body, superadmin: true })).status, 400,
      'Unknown privilege escalation fields must fail validation');
    const created = await api('/platform/tenants', operatorToken, 'POST', body);
    assert.equal(created.status, 201, JSON.stringify(created.data));
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
    assert.equal(detail.data.tenant.userCount, 1);
    const updated = await api('/platform/tenants/studio-beta', operatorToken, 'PATCH', { name: 'Studio Beta Updated', description: 'Client workspace' });
    assert.equal(updated.status, 200);
    assert.equal(updated.data.tenant.description, 'Client workspace');
    assert.equal((await api('/platform/tenants/studio-beta', operatorToken, 'PATCH', { status: 'ACTIVE' })).status, 400);
    login = await api('/auth/login', '', 'POST', { email: body.email, password: tenantPassword });
    assert.equal(login.status, 200);
    const tenantToken = String(login.data.access_token);
    const tenantRefreshCookie = login.cookie;
    assert.equal((await api('/platform/tenants', tenantToken)).status, 403);
    assert.equal((await api('/platform/tenants/studio-beta/suspend', tenantToken, 'POST', {})).status, 403);
    assert.equal((await api('/auth/me', tenantToken)).status, 200);
    assert.equal((await api('/platform/tenants/studio-beta/suspend', operatorToken, 'POST', {})).status, 200);
    assert.equal((await api('/auth/me', tenantToken)).status, 401, 'Existing access token must be blocked');
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
    assert.equal((await api('/platform/tenants/studio-beta/reactivate', operatorToken, 'POST', {})).status, 409);
    await stop(child!);
    await start();
    const newLogin = await api('/auth/login', '', 'POST', { email: operatorEmail, password: operatorPassword });
    assert.equal(newLogin.status, 200);
    const persisted = await api('/platform/tenants/studio-beta', String(newLogin.data.access_token));
    assert.equal(persisted.status, 200);
    assert.equal(persisted.data.tenant.name, 'Studio Beta Updated');
    assert.equal(persisted.data.tenant.status, 'ACTIVE');
  } finally {
    if (child) await stop(child);
    await rm(dir, { recursive: true, force: true });
  }
});
