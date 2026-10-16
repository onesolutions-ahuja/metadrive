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
const adminEmail = 'md01a-admin@example.test';
const password = 'Metadrive-Policy-Smoke-Test-2026!';
const bootstrapKey = 'metadrive-platform-bootstrap-smoke-2026';
async function port(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP port');
  return await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve(address.port)));
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 4000))]);
}
test('MD-01A: tenant RBAC cannot grant platform licences; bootstrap and policy assignment remain platform-only', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metadrive-platform-policy-'));
  const portNumber = await port();
  let logs = '';
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd,
    env: {
      ...process.env,
      PORT: String(portNumber),
      NODE_ENV: 'test',
      METADRIVE_TEST_MODE: 'true',
      METADRIVE_DATA_PATH: path.join(dir, 'state.json'),
      METADRIVE_BOOTSTRAP_TENANT_ID: 'platform-policy-smoke',
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'Platform Policy Smoke',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: adminEmail,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password,
      METADRIVE_PLATFORM_BOOTSTRAP_EMAIL: adminEmail,
      METADRIVE_PLATFORM_BOOTSTRAP_KEY: bootstrapKey
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', (data: Buffer) => { logs += data.toString(); });
  child.stderr?.on('data', (data: Buffer) => { logs += data.toString(); });
  try {
    let ready = false;
    for (let i = 0; i < 300; i++) {
      if (child.exitCode !== null) throw new Error('Server startup failed: ' + logs);
      try {
        const health = await fetch('http://127.0.0.1:' + portNumber + '/health', { signal: AbortSignal.timeout(500) });
        if (health.ok) { ready = true; break; }
      } catch { /* booting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, logs);
    const api = async (route: string, token = '', method = 'GET', body?: unknown, secret?: string) => {
      const response = await fetch('http://127.0.0.1:' + portNumber + '/api' + route, {
        method,
        headers: {
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(secret ? { 'x-platform-bootstrap-key': secret } : {})
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const raw = await response.text();
      return { status: response.status, data: raw ? JSON.parse(raw) as Record<string, any> : {} };
    };
    const login = await api('/auth/login', '', 'POST', { email: adminEmail, password });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const token = String(login.data.access_token);
    const userId = String(login.data.user.id);
    assert.equal((await api('/connector-apps/capabilities', token)).data.licence, false);
    assert.equal((await api('/platform/policies', token)).status, 403);
    const existing = await api('/metadata/permissions', token);
    assert.equal(existing.status, 200);
    const assigned = structuredClone(existing.data);
    const administrator = assigned.profiles.find((profile: { id: string }) => profile.id === 'system-administrator');
    assert.ok(administrator);
    administrator.systemPermissions.push('licence:manage');
    assert.equal((await api('/metadata/permissions', token, 'PUT', assigned)).status, 403,
      'Tenant security admins cannot turn themselves into platform licence operators');
    assert.equal((await api('/platform/policies/bootstrap', token, 'POST', {}, 'wrong-bootstrap-key')).status, 403);
    assert.equal((await api('/platform/policies/bootstrap', token, 'POST', {}, bootstrapKey)).status, 200);
    assert.equal((await api('/platform/policies/bootstrap', token, 'POST', {}, bootstrapKey)).status, 409,
      'Platform policy bootstrap may not be repeated');
    assert.equal((await api('/connector-apps/capabilities', token)).data.licence, true,
      'Platform policy should be visible immediately through in-memory authorisation');
    assert.equal((await api('/platform/policies', token)).status, 200);
    assert.equal((await api('/platform/policies/' + userId, token, 'PUT', { policies: [] })).status, 409,
      'Last active platform superadmin cannot be removed');
    assert.equal((await api('/platform/policies/' + userId, token, 'PUT', { policies: ['platform:superadmin','licence:manage'] })).status, 200);
    const list = await api('/platform/policies', token);
    assert.equal(list.status, 200);
    assert.ok(list.data.users.some((user: { id: string }) => user.id === userId));
  } finally {
    await stop(child);
    await rm(dir, { recursive: true, force: true });
  }
});
