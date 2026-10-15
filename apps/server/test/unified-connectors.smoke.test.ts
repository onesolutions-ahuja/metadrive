import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tenantId = 'unified-connector-smoke';
const email = 'admin@unified-connector-smoke.test';
const password = 'Unified-Smoke-Password-2026!';

async function freePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}
async function boot(dataPath: string, unified: boolean, bootstrap: boolean) {
  const port = await freePort();
  let logs = '';
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      METADRIVE_DATA_PATH: dataPath,
      METADRIVE_UNIFIED_CONNECTORS: unified ? 'true' : 'false',
      METADRIVE_CREDENTIAL_KEYS: JSON.stringify({ 'test-key': Buffer.alloc(32, 7).toString('base64') }),
      METADRIVE_CREDENTIAL_ACTIVE_KEY_ID: 'test-key',
      ...(bootstrap ? {
        METADRIVE_BOOTSTRAP_TENANT_ID: tenantId,
        METADRIVE_BOOTSTRAP_TENANT_NAME: 'Unified Connectors Smoke',
        METADRIVE_BOOTSTRAP_ADMIN_EMAIL: email,
        METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password
      } : {})
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout?.on('data', (data: Buffer) => { logs += data.toString(); });
  child.stderr?.on('data', (data: Buffer) => { logs += data.toString(); });
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Startup failed: ' + logs);
    try {
      const response = await fetch('http://127.0.0.1:' + port + '/health', { signal: AbortSignal.timeout(500) });
      if (response.ok) return { port, child };
    } catch { /* waiting for startup */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error('Timed out starting server: ' + logs);
}
async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
}
async function api(port: number, pathName: string, token?: string, method = 'GET', body?: unknown) {
  const response = await fetch('http://127.0.0.1:' + port + '/api' + pathName, {
    method,
    headers: {
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const raw = await response.text();
  return { status: response.status, data: raw ? JSON.parse(raw) as Record<string, any> : {} };
}

test('one connector store survives migration and restart without duplicate objects', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'metadrive-unified-'));
  const file = path.join(folder, 'state.json');
  let active: ChildProcess | undefined;
  try {
    const first = await boot(file, false, true);
    active = first.child;
    const loggedIn = await api(first.port, '/auth/login', undefined, 'POST', { email, password });
    assert.equal(loggedIn.status, 200, JSON.stringify(loggedIn.data));
    const token = loggedIn.data.access_token as string;
    const smtp = await api(first.port, '/named-credentials', token, 'POST', {
      name: 'UNE_SMTP', label: 'UNE SMTP', protocol: 'SMTP',
      baseUrl: 'smtp://smtp.example.com:587', authType: 'None'
    });
    assert.equal(smtp.status, 201, JSON.stringify(smtp.data));
    const originalSmtpId = smtp.data.credential.id as string;
    await stop(active);
    active = undefined;
    const state = JSON.parse(await readFile(file, 'utf8')) as Record<string, any>;
    const tenant = state.tenants[tenantId] as Record<string, any>;
    const existing = tenant.records.UneConnector__c as Array<Record<string, any>>;
    assert.ok(Array.isArray(existing), 'Expected legacy connector fixtures; keys='+Object.keys(tenant.records||{}).join(',')+' availableObjects='+tenant.objects?.map((x:any)=>x.apiName).filter((x:string)=>x.includes('Connector')).join(','));
    assert.equal(existing.length, 5);
    const owner = String(existing[0].OwnerId);
    const whatsapp = existing.find((item) => item.Name === 'WhatsApp');
    assert.ok(whatsapp);
    whatsapp.Configuration__c = JSON.stringify({ PhoneNumberId: '123456789', NamedCredential: 'WhatsApp_Dummy' });
    for (const name of ['SMSGate', 'Xero']) {
      const id = randomUUID();
      existing.push({
        Id: id, Name: name, ConnectorType__c: name,
        Status__c: 'Not Configured', Configuration__c: JSON.stringify({ TenantId: '' }),
        OwnerId: owner, RecordTypeId: 'master',
        CreatedDate: new Date().toISOString(), LastModifiedDate: new Date().toISOString()
      });
    }
    await writeFile(file, JSON.stringify(state));
    const second = await boot(file, true, false);
    active = second.child;
    const again = await api(second.port, '/auth/login', undefined, 'POST', { email, password });
    assert.equal(again.status, 200, JSON.stringify(again.data));
    const access = again.data.access_token as string;
    const objects = await api(second.port, '/metadata/objects', access);
    assert.equal(objects.status, 200);
    for (const obsolete of ['UneConnector__c', 'ConnectorProvider__c', 'IntegrationConnection__c']) {
      assert.ok(!(objects.data.objects as Array<{ apiName: string }>).some((item) => item.apiName === obsolete));
      assert.equal((await api(second.port, '/records/' + obsolete, access)).status, 404);
    }
    const named = await api(second.port, '/named-credentials', access);
    assert.equal(named.status, 200);
    const credentials = named.data.credentials as Array<Record<string, any>>;
    for (const label of ['WhatsApp Dummy — update before activation', 'UNE SMTP', 'SMS', 'Uber', 'Deliveroo', 'SMSGate', 'Xero']) {
      assert.ok(credentials.some((credential) => credential.label === label), 'Missing ' + label);
    }
    assert.equal(credentials.find((item) => item.name === 'UNE_SMTP')?.id, originalSmtpId);
    assert.equal(credentials.find((item) => item.name === 'WhatsApp_Dummy')?.configuration.PhoneNumberId, '123456789');
    assert.equal(credentials.length, 7);
    await stop(active);
    active = undefined;
    const persisted = JSON.parse(await readFile(file, 'utf8')) as Record<string, any>;
    const migratedTenant = persisted.tenants[tenantId] as Record<string, any>;
    assert.equal(migratedTenant.records.UneConnector__c, undefined);
    assert.equal(migratedTenant.records.ConnectorProvider__c, undefined);
    assert.equal(migratedTenant.records.IntegrationConnection__c, undefined);
    const third = await boot(file, true, false);
    active = third.child;
    const login3 = await api(third.port, '/auth/login', undefined, 'POST', { email, password });
    assert.equal(login3.status, 200);
    const last = await api(third.port, '/named-credentials', login3.data.access_token as string);
    assert.equal((last.data.credentials as unknown[]).length, 7);
    assert.equal((last.data.credentials as Array<Record<string, any>>).find((item) => item.name === 'WhatsApp_Dummy')?.configuration.PhoneNumberId, '123456789');
  } finally {
    if (active) await stop(active);
    await rm(folder, { recursive: true, force: true });
  }
});
