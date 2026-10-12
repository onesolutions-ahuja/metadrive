import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = require.resolve('tsx/cli');
async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No available port');
  return await new Promise<number>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve(address.port)));
}

test('Module 4: immediate session revocation, tenant audit isolation and password rotation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metadrive-auth-sessions-'));
  const port = await freePort();
  const email = 'admin@module4-smoke.test';
  const password = 'Module4-Secure-Test-Password-2026!';
  const nextPassword = 'Module4-Rotated-Secure-Password-2026!';
  let logs = '';
  const child = spawn(process.execPath, [cli, 'src/index.ts'], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'test', PORT: String(port), METADRIVE_TEST_MODE: 'true',
      METADRIVE_DATA_PATH: path.join(dir, 'state.json'),
      METADRIVE_BOOTSTRAP_TENANT_ID: 'module4-primary',
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'Module 4 Primary',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: email,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password,
      METADRIVE_PROVISIONING_KEY: 'module4-separate-test-provisioning-key'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', (buffer: Buffer) => { logs += buffer.toString(); });
  child.stderr?.on('data', (buffer: Buffer) => { logs += buffer.toString(); });
  const send = async (route: string, token = '', method = 'GET', body?: unknown, headers?: Record<string, string>) => {
    const response = await fetch('http://127.0.0.1:' + port + '/api' + route, {
      method, headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const raw = await response.text();
    return { status: response.status, data: raw ? JSON.parse(raw) as Record<string, any> : {} };
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 600; attempt++) {
      if (child.exitCode !== null) throw Error('Server exited: ' + logs);
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(500) });
        if (response.ok) { ready = true; break; }
      } catch { /* waiting for app startup */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, logs);
    const login = await send('/auth/login', '', 'POST', { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const token = String(login.data.access_token);
    const sessionList = await send('/auth/sessions', token);
    assert.equal(sessionList.status, 200);
    assert.ok(sessionList.data.sessions.length >= 1);
    assert.equal(JSON.stringify(sessionList.data).includes('tokenHash'), false);
    assert.equal(JSON.stringify(sessionList.data).includes('password'), false);

    const other = await send('/auth/provision-tenant', '', 'POST', {
      tenantId: 'module4-other', tenantName: 'Other Tenant',
      adminName: 'Other Admin', email: 'other@module4-smoke.test', password
    }, { 'x-provisioning-key': 'module4-separate-test-provisioning-key' });
    assert.equal(other.status, 201, JSON.stringify(other.data));
    const otherLogin = await send('/auth/login', '', 'POST', { email: 'other@module4-smoke.test', password });
    assert.equal(otherLogin.status, 200);
    const otherToken = String(otherLogin.data.access_token);

    const policy = await send('/auth/mfa/policy', token, 'PUT', { mode: 'Off' });
    assert.equal(policy.status, 200);
    const deny = await send('/auth/sessions/revoke-all', token, 'POST', { currentPassword: 'Wrong-Password-123!' });
    assert.equal(deny.status, 401);
    assert.equal((await send('/auth/me', token)).status, 200);

    const revoke = await send('/auth/sessions/revoke-all', token, 'POST', { currentPassword: password });
    assert.equal(revoke.status, 200, JSON.stringify(revoke.data));
    assert.equal((await send('/auth/me', token)).status, 401,
      'Bearer token must be invalid immediately, not just the refresh cookie');
    assert.equal((await send('/auth/me', otherToken)).status, 200,
      'Revocation in one tenant must not disable another tenant');

    const loggedAgain = await send('/auth/login', '', 'POST', { email, password });
    assert.equal(loggedAgain.status, 200, JSON.stringify(loggedAgain.data));
    const latest = String(loggedAgain.data.access_token);
    assert.equal((await send('/auth/me', latest)).status, 200,
      'New login must work even in the same second as revocation');

    const permissionMetadata = await send('/metadata/permissions', latest);
    assert.equal(permissionMetadata.status, 200);
    assert.equal((await send('/metadata/permissions', latest, 'PUT', permissionMetadata.data)).status, 200);
    const events = await send('/auth/security-events?limit=100', latest);
    assert.equal(events.status, 200);
    assert.ok(events.data.events.some((item: {action: string}) => item.action === 'auth.login.succeeded'));
    assert.ok(events.data.events.some((item: {action: string}) => item.action === 'auth.sessions.revoked-all'));
    assert.ok(events.data.events.some((item: {action: string}) => item.action === 'rbac.permissions.updated'));
    const otherEvents = await send('/auth/security-events?limit=100', otherToken);
    assert.equal(otherEvents.status, 200);
    assert.equal(otherEvents.data.events.some((item: {action: string}) => item.action === 'auth.sessions.revoked-all'), false,
      'Security events must never cross tenant boundaries');
    assert.equal((await send('/auth/security-events?limit=9999', latest)).status, 400);

    const change = await send('/auth/change-password', latest, 'POST', { currentPassword: password, newPassword: nextPassword });
    assert.equal(change.status, 200);
    assert.equal((await send('/auth/me', latest)).status, 401);
    assert.equal((await send('/auth/login', '', 'POST', { email, password })).status, 401);
    const rotatedLogin = await send('/auth/login', '', 'POST', { email, password: nextPassword });
    assert.equal(rotatedLogin.status, 200);
    assert.equal((await send('/auth/me', String(rotatedLogin.data.access_token))).status, 200);
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    await rm(dir, { recursive: true, force: true });
  }
});
