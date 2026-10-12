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
const tsxCli = require.resolve('tsx/cli');
async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No TCP port');
  return await new Promise<number>((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve(address.port)));
}
test('Module 4: app/tab permission grants and group muting update without stale navigation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metadrive-navigation-rbac-'));
  const port = await freePort();
  const email = 'admin@navigation-rbac.test';
  const password = 'MetaDrive-Navigation-RBAC-Test-2026!';
  let logs = '';
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd, env: {
      ...process.env, NODE_ENV: 'test', METADRIVE_TEST_MODE: 'true',
      PORT: String(port), METADRIVE_DATA_PATH: path.join(dir, 'state.json'),
      METADRIVE_BOOTSTRAP_TENANT_ID: 'navigation-rbac',
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'Navigation RBAC',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: email,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  const api = async (url: string, token = '', method = 'GET', body?: unknown) => {
    const response = await fetch('http://127.0.0.1:' + port + '/api' + url, {
      method, headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const raw = await response.text();
    return { status: response.status, data: raw ? JSON.parse(raw) as Record<string, any> : {} };
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 600; attempt++) {
      if (child.exitCode !== null) throw Error('Unexpected API shutdown: ' + logs);
      try {
        const health = await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(500) });
        if (health.ok) { ready = true; break; }
      } catch { /* starting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, logs);
    const login = await api('/auth/login', '', 'POST', { email, password });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const token = String(login.data.access_token);
    const apps = await api('/metadata/apps', token);
    assert.equal(apps.status, 200);
    const app = apps.data.apps.find((item: any) => item.navigationItems.includes('Account'));
    assert.ok(app, 'seed must expose an app containing Accounts');
    const name = String(app.apiName);
    const base = await api('/metadata/permissions', token);
    assert.equal(base.status, 200);
    const security = structuredClone(base.data);
    const admin = security.profiles.find((item: any) => item.id === 'system-administrator');
    const directSet = security.permissionSets.find((item: any) => item.id === 'system-administrator');
    const user = security.users.find((item: any) => item.username === email);
    assert.ok(admin && directSet && user);
    const save = (value: any) => api('/metadata/permissions', token, 'PUT', value);
    admin.appPermissions = { ...(admin.appPermissions ?? {}), [name]: false };
    assert.equal((await save(security)).status, 200);
    assert.equal((await api('/metadata/apps', token)).data.apps.some((item: any) => item.apiName === name), false);
    assert.equal((await api('/apps/' + encodeURIComponent(name) + '/home-page', token)).status, 404,
      'Hidden app must not be accessible by direct API request');

    directSet.appPermissions = { ...(directSet.appPermissions ?? {}), [name]: true };
    assert.equal((await save(security)).status, 200);
    assert.equal((await api('/metadata/apps', token)).data.apps.some((item: any) => item.apiName === name), true,
      'Direct permission set restores visibility');

    user.permissionSetIds = [];
    user.permissionSetGroupIds = ['nav-group'];
    security.permissionSetGroups.push({
      id: 'nav-group', label: 'Navigation Group', apiName: 'Navigation_Group',
      description: '', permissionSetIds: [directSet.id],
      calculationStatus: 'Updated', lastCalculatedAt: null,
      mutedSystemPermissions: [], mutedObjectPermissions: {}, mutedRecordTypePermissions: {},
      mutedFieldPermissions: {}, mutedAppPermissions: { [name]: true }, mutedTabPermissions: {}
    });
    assert.equal((await save(security)).status, 200);
    assert.equal((await api('/metadata/apps', token)).data.apps.some((item: any) => item.apiName === name), false,
      'Group muting blocks the group grant');
    security.permissionSetGroups[security.permissionSetGroups.length - 1].mutedAppPermissions[name] = false;
    assert.equal((await save(security)).status, 200);
    assert.equal((await api('/metadata/apps', token)).data.apps.some((item: any) => item.apiName === name), true,
      'Unmuting restores access immediately');
    admin.tabPermissions = { ...(admin.tabPermissions ?? {}), Account: false };
    assert.equal((await save(security)).status, 200);
    assert.equal((await api('/metadata/apps', token)).data.apps
      .find((item: any) => item.apiName === name).navigationItems.includes('Account'), false,
      'Tab restriction filters navigation without disabling record authorization');
    directSet.tabPermissions = { ...(directSet.tabPermissions ?? {}), Account: true };
    assert.equal((await save(security)).status, 200);
    assert.equal((await api('/metadata/apps', token)).data.apps
      .find((item: any) => item.apiName === name).navigationItems.includes('Account'), true);
    admin.appPermissions = { Unknown_Other_Tenant_App: true };
    assert.equal((await save(security)).status, 400,
      'Foreign and nonexistent app references must fail validation');
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    await rm(dir, { recursive: true, force: true });
  }
});
