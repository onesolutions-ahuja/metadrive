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
import { appAccessDecision } from '../src/app-access.js';
import { connectorProviderEntitlement, applyConnectorLifecycle } from '../src/connector-app-runtime.js';

test('MD-01C: app assignment and expiry use current in-memory records', () => {
  const owner = { userId: 'owner', profileId: 'owner-profile' };
  const cashier = { userId: 'cashier', profileId: 'cashier-profile' };
  const app = {
    apiName: 'Till',
    access: { mode: 'Assigned' as const, userIds: ['owner'], profileIds: [] as string[] },
    licenceAppKey: 'till'
  };
  const records = [{
    AppKey__c: 'till', Installed__c: true, TrialUsed__c: false,
    LicenceExpiresAt__c: '2026-11-01T00:00:00.000Z'
  }];
  const now = Date.parse('2026-10-31T23:59:59.999Z');
  assert.equal(appAccessDecision(app, owner, records, now).allowed, true);
  assert.equal(appAccessDecision(app, cashier, records, now).reason, 'not-assigned');
  assert.equal(appAccessDecision(app, owner, records, now + 1).reason, 'not-licensed');
  assert.equal(appAccessDecision(app, owner, [], now).reason, 'not-licensed');
  assert.equal(appAccessDecision(app, owner, [{ ...records[0], Installed__c: false }], now).reason, 'not-licensed');
  assert.equal(appAccessDecision({ ...app, access: { mode: 'Assigned', userIds: [], profileIds: ['cashier-profile'] } },
    cashier, records, now).allowed, true);
  assert.equal(appAccessDecision({ apiName: 'Records' }, cashier, [], now).allowed, true,
    'Existing free apps preserve tenant-wide access');
  assert.equal(appAccessDecision({ apiName: 'Unlicensed', licenceAppKey: 'missing' }, cashier, [], now).allowed, false);
});

test('MD-01D: managed provider licence is enforced at each callout without DB reads', () => {
  const licensedAt = new Date('2026-10-31T23:59:59Z');
  const expiredAt = new Date('2026-11-01T00:00:00Z');
  const app = {
    Name: 'Managed WhatsApp', AppKey__c: 'whatsapp', ProviderConnectorKey__c: 'META_WHATSAPP',
    CredentialName__c: 'WhatsApp_Dummy', Installed__c: true,
    TrialUsed__c: false, TrialExpiresAt__c: '',
    LicenceExpiresAt__c: '2026-11-01T00:00:00Z'
  };
  assert.equal(connectorProviderEntitlement([app], 'META_WHATSAPP', licensedAt).allowed, true);
  assert.equal(connectorProviderEntitlement([app], 'META_WHATSAPP', expiredAt).allowed, false);
  assert.equal(connectorProviderEntitlement([{...app,Installed__c:false}], 'META_WHATSAPP', licensedAt).allowed, false);
  assert.equal(connectorProviderEntitlement([{...app,LicenceExpiresAt__c:'',TrialUsed__c:true,
    TrialExpiresAt__c:'2026-11-01T00:00:00Z'}], 'META_WHATSAPP', licensedAt).allowed, true);
  assert.equal(connectorProviderEntitlement([app], 'CUSTOM_UNMANAGED', expiredAt).managed, false);
  assert.throws(() => applyConnectorLifecycle(app, { ...app, ProviderConnectorKey__c:'CUSTOM_UNMANAGED' },
    [], [], licensedAt, false), /ProviderConnectorKey__c/,
    'Tenant configuration must not detach the provider from its package');
});

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
async function port(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No available port');
  return await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve(address.port)));
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 4000))]);
}

test('MD-01C: app permissions, profile assignments and licensed runtime routes', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metadrive-app-entitlement-'));
  const serverPort = await port();
  const adminEmail = 'app-entitlement-admin@test.example';
  const cashierEmail = 'app-entitlement-cashier@test.example';
  const password = 'Metadrive-App-Entitlement-Test-2026!';
  const bootstrapKey = 'metadrive-app-entitlement-policy-bootstrap-2026';
  let logs = '';
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd,
    env: {
      ...process.env, PORT: String(serverPort), NODE_ENV: 'test',
      METADRIVE_TEST_MODE: 'true', METADRIVE_DATA_PATH: path.join(dir, 'state.json'),
      METADRIVE_BOOTSTRAP_TENANT_ID: 'app-entitlement-smoke',
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'App Entitlement Smoke',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: adminEmail,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password,
      METADRIVE_PLATFORM_BOOTSTRAP_EMAIL: adminEmail,
      METADRIVE_PLATFORM_BOOTSTRAP_KEY: bootstrapKey
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  const api = async (route: string, token?: string, method = 'GET', body?: unknown, headers?: Record<string, string>) => {
    const response = await fetch('http://127.0.0.1:' + serverPort + '/api' + route, {
      method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {})
    });
    const raw = await response.text();
    return { status: response.status, data: raw ? JSON.parse(raw) as Record<string, any> : {} };
  };
  try {
    let ready = false;
    for (let i = 0; i < 500; i++) {
      if (child.exitCode !== null) throw Error('Server terminated: ' + logs);
      try {
        const res = await fetch('http://127.0.0.1:' + serverPort + '/health', { signal: AbortSignal.timeout(500) });
        if (res.ok) { ready = true; break; }
      } catch { /* booting */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, logs);
    const adminLogin = await api('/auth/login', undefined, 'POST', { email: adminEmail, password });
    assert.equal(adminLogin.status, 200, JSON.stringify(adminLogin.data));
    const adminToken = String(adminLogin.data.access_token);
    const adminId = String(adminLogin.data.user.id);
    const roles = (await api('/metadata/permissions', adminToken)).data.roles as Array<{ name: string }>;
    const role = roles.find((item) => item.name === 'Standard User') ?? roles.find((item) => item.name !== 'System Administrator');
    assert.ok(role);
    const createdCashier = await api('/records/User', adminToken, 'POST', {
      Name: 'Till Cashier', Email: cashierEmail, Username: cashierEmail,
      UserRoleId: role.name, IsActive: true, Password: password
    });
    assert.equal(createdCashier.status, 201, JSON.stringify(createdCashier.data));
    const cashierId = String(createdCashier.data.record.Id);
    const cashierLogin = await api('/auth/login', undefined, 'POST', { email: cashierEmail, password });
    assert.equal(cashierLogin.status, 200, JSON.stringify(cashierLogin.data));
    const cashierToken = String(cashierLogin.data.access_token);
    const createApp = await api('/metadata/apps', adminToken, 'POST', {
      apiName: 'Till', label: 'Till', description: '',
      navigationItems: ['Account'], brandColor: '#0176d3', utilityItems: []
    });
    assert.equal(createApp.status, 201, JSON.stringify(createApp.data));
    assert.deepEqual(createApp.data.app.access, {
      mode: 'Assigned', userIds: [adminId], profileIds: []
    }, 'Only the creating user has initial access');
    assert.equal((await api('/apps/Till/home-page', cashierToken)).status, 403);
    assert.equal((await api('/apps/Till/pages/Missing_Page', cashierToken)).status, 403);
    assert.equal((await api('/apps/Till/home-page', adminToken)).status, 200);
    assert.ok(!(await api('/apps/accessible', cashierToken)).data.apps.some((x: { apiName: string }) => x.apiName === 'Till'));
    assert.equal((await api('/metadata/apps/Till', adminToken, 'PUT', {
      ...createApp.data.app, access: { mode: 'AllTenantUsers', userIds: [], profileIds: [] }
    })).status, 403, 'App editor cannot change security assignments');
    const grant = await api('/metadata/apps/Till/access', adminToken, 'PUT', {
      mode: 'Assigned', userIds: [adminId, cashierId], profileIds: []
    });
    assert.equal(grant.status, 200, JSON.stringify(grant.data));
    assert.equal((await api('/apps/Till/home-page', cashierToken)).status, 200,
      'Existing session immediately sees new access');
    assert.equal((await api('/apps/Till/pages/Missing_Page', cashierToken)).status, 404,
      'Assigned user passes the access guard before normal page lookup');
    assert.ok((await api('/apps/accessible', cashierToken)).data.apps.some((x: { apiName: string }) => x.apiName === 'Till'));
    assert.equal((await api('/metadata/apps/Till/access', adminToken, 'PUT', {
      mode: 'Assigned', userIds: [adminId, 'another-tenant-user'], profileIds: []
    })).status, 400, 'Unknown tenant users cannot be assigned');
    assert.equal((await api('/metadata/apps/Till/access', cashierToken, 'PUT', {
      mode: 'AllTenantUsers', userIds: [], profileIds: []
    })).status, 403, 'Cashier cannot grant themselves broader access');
    assert.equal((await api('/platform/apps/Till/licence-link', adminToken, 'PUT', { licenceAppKey: 'xero' })).status, 403,
      'Tenant admin cannot bind commercial licence without platform policy');
    assert.equal((await api('/platform/policies/bootstrap', adminToken, 'POST', {}, {
      'x-platform-bootstrap-key': bootstrapKey
    })).status, 200);
    assert.equal((await api('/platform/apps/Till/licence-link', adminToken, 'PUT',
      { licenceAppKey: 'missing' })).status, 400);
    assert.equal((await api('/platform/apps/Till/licence-link', adminToken, 'PUT',
      { licenceAppKey: 'xero' })).status, 200);
    assert.equal((await api('/apps/Till/home-page', cashierToken)).status, 403,
      'Installed but unlicensed app cannot render');
    const connectorRecords = await api('/records/Connector_App__c?limit=100', adminToken);
    assert.equal(connectorRecords.status, 200, JSON.stringify(connectorRecords.data));
    const xero = connectorRecords.data.records.find((x: Record<string, any>) => x.AppKey__c === 'xero');
    assert.ok(xero?.InstallFlow__c && xero?.TrialFlow__c);
    assert.equal((await api('/flows/' + encodeURIComponent(xero.InstallFlow__c) + '/execute', adminToken, 'POST',
      { AppKey: 'xero' })).status, 200);
    assert.equal((await api('/flows/' + encodeURIComponent(xero.TrialFlow__c) + '/execute', adminToken, 'POST',
      { AppKey: 'xero' })).status, 200);
    assert.equal((await api('/apps/Till/home-page', cashierToken)).status, 200,
      'App becomes accessible once configured licence is active');
    const revoke = await api('/metadata/apps/Till/access', adminToken, 'PUT', {
      mode: 'Assigned', userIds: [adminId], profileIds: []
    });
    assert.equal(revoke.status, 200);
    assert.equal((await api('/apps/Till/home-page', cashierToken)).status, 403,
      'Assignment revocation takes effect immediately, without token reissue');
    assert.equal((await api('/apps/Till/home-page', adminToken)).status, 200);
    const currentAccess = (await api('/metadata/permissions', adminToken)).data.users as Array<Record<string, any>>;
    const cashierProfileId = currentAccess.find((x) => x.id === cashierId)?.profileId;
    assert.ok(cashierProfileId);
    const profileGrant = await api('/metadata/apps/Till/access', adminToken, 'PUT', {
      mode: 'Assigned', userIds: [adminId], profileIds: [cashierProfileId]
    });
    assert.equal(profileGrant.status, 200);
    assert.equal((await api('/apps/Till/home-page', cashierToken)).status, 200);
    // Paid Flow bindings cannot be modified through editable Flow metadata
    // or by a tenant administrator lacking the platform licence policy.
    const lifecycleFlow = 'ONE_Uninstall_Connector';
    const platformBinding = await api('/metadata/flows/' + lifecycleFlow + '/app-binding',
      adminToken, 'PUT', { appApiName: 'Till' });
    assert.equal(platformBinding.status, 200, JSON.stringify(platformBinding.data));
    assert.equal((await api('/metadata/flows/' + lifecycleFlow + '/app-binding',
      cashierToken, 'PUT', { appApiName: null })).status, 403);
    assert.equal((await api('/flows/' + lifecycleFlow + '/execute', cashierToken, 'POST', {})).status, 403,
      'Cashier cannot invoke bound Flow without flows:run RBAC; denies by default');
    assert.equal((await api('/metadata/flows/' + lifecycleFlow + '/app-binding',
      adminToken, 'PUT', { appApiName: 'Missing_App' })).status, 404);
    assert.equal((await api('/metadata/apps/Till', adminToken, 'DELETE')).status, 409,
      'Bound Flow must be disconnected before deleting its app');
    const before = await api('/metadata/apps/Till/access', adminToken, 'PUT', {
      mode: 'Assigned', userIds: [adminId], profileIds: []
    });
    assert.equal(before.status, 200);
    assert.equal((await api('/flows/' + lifecycleFlow + '/execute', cashierToken, 'POST', {})).status, 403,
      'Revocation persists through direct Flow endpoint');
    const unlink = await api('/metadata/flows/' + lifecycleFlow + '/app-binding',
      adminToken, 'PUT', { appApiName: null });
    assert.equal(unlink.status, 200);
  } finally {
    await stop(child);
    await rm(dir, { recursive: true, force: true });
  }
});
