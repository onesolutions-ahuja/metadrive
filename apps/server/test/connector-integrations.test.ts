import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tenantId = 'connector-integrations-smoke';
const adminEmail = 'admin@connector-integrations-smoke.test';
const adminPassword = 'Connector-Smoke-Password-2026!';

async function availablePort(): Promise<number> {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port');
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

async function startApi(port: number, dataPath: string): Promise<ChildProcess> {
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      PORT: String(port),
      METADRIVE_DATA_PATH: dataPath,
      METADRIVE_CREDENTIAL_KEYS: JSON.stringify({ 'test-key': Buffer.alloc(32, 7).toString('base64') }),
      METADRIVE_CREDENTIAL_ACTIVE_KEY_ID: 'test-key',
      METADRIVE_BOOTSTRAP_TENANT_ID: tenantId,
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'Connector Integrations Smoke',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: adminEmail,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: adminPassword
    },
    stdio: 'ignore'
  });
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) throw new Error('Test API exited during startup');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return child;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  child.kill();
  throw new Error('Test API did not become ready');
}

async function stopApi(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
}

test('connector providers and tenant connections are metadata-backed and keep credentials encrypted', async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-connectors-'));
  const dataPath = path.join(dataDirectory, 'platform-state.json');
  const port = await availablePort();
  let child: ChildProcess | undefined;
  try {
    child = await startApi(port, dataPath);
    const root = `http://127.0.0.1:${port}/api`;
    const request = async (pathname: string, token?: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`${root}${pathname}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const text = await response.text();
      return { status: response.status, data: text ? JSON.parse(text) as Record<string, any> : {} };
    };
    const login = await request('/auth/login', undefined, 'POST', { email: adminEmail, password: adminPassword });
    assert.equal(login.status, 200);
    const token = login.data.access_token as string;

    const objects = (await request('/metadata/objects', token)).data.objects as Array<{ apiName: string; pluralLabel: string }>;
    assert.ok(objects.some((item) => item.apiName === 'ConnectorProvider__c' && item.pluralLabel === 'Connector Providers'));
    assert.ok(objects.some((item) => item.apiName === 'IntegrationConnection__c' && item.pluralLabel === 'Integration Connections'));
    const providers = (await request('/connector-providers', token)).data.providers as Array<Record<string, any>>;
    const whatsapp = providers.find((item) => item.connectorKey === 'META_WHATSAPP');
    assert.ok(whatsapp);
    assert.equal(whatsapp.authType, 'BEARER');
    assert.equal(whatsapp.timeoutMs, 30000);
    assert.deepEqual(whatsapp.retryPolicy, { maxAttempts: 3 });
    assert.deepEqual(whatsapp.operations.send_message, { method: 'POST', path: '/{phone_number_id}/messages' });
    assert.deepEqual(whatsapp.test, { method: 'GET', path: '/{phone_number_id}?fields=id', expectedStatus: 200 });
    const providerRecords = (await request('/records/ConnectorProvider__c', token)).data.records as Array<Record<string, unknown>>;
    assert.equal(providerRecords.length, 5);

    const secret = 'smoke-only-access-token';
    const created = await request('/integration-connections', token, 'POST', {
      connectorKey: 'META_WHATSAPP',
      name: 'WhatsApp Production',
      configuration: { phone_number_id: 'phone-123', waba_id: 'waba-456' },
      credentials: { access_token: secret },
      status: 'ACTIVE'
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    const connection = created.data.connection as Record<string, any>;
    assert.equal(connection.hasCredentials, true);
    assert.equal(connection.credentialFields.find((field: Record<string, unknown>) => field.name === 'access_token').configured, true);
    assert.equal(JSON.stringify(created.data).includes(secret), false);
    const connectionRecords = (await request('/records/IntegrationConnection__c', token)).data.records as Array<Record<string, unknown>>;
    assert.equal(connectionRecords[0].Name, 'WhatsApp Production');
    assert.equal(JSON.stringify(connectionRecords).includes(secret), false);
    assert.equal((await readFile(dataPath, 'utf8')).includes(secret), false);

    const updated = await request(`/integration-connections/${connection.id}`, token, 'PUT', {
      connectorKey: 'META_WHATSAPP',
      name: 'WhatsApp Production',
      configuration: { phone_number_id: 'phone-123', waba_id: 'waba-456' },
      credentials: {},
      status: 'ACTIVE'
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.connection.hasCredentials, true);
    const plaintextCredential = await request('/integration-connections', token, 'POST', {
      connectorKey: 'META_WHATSAPP',
      name: 'Unsafe Config',
      configuration: { access_token: secret, phone_number_id: 'phone-123' },
      credentials: {},
      status: 'ACTIVE'
    });
    assert.equal(plaintextCredential.status, 400);

    const unconfigured = await request('/integration-connections', token, 'POST', {
      connectorKey: 'META_WHATSAPP',
      name: 'Unconfigured WhatsApp',
      configuration: {},
      credentials: {}
    });
    assert.equal(unconfigured.status, 201, JSON.stringify(unconfigured.data));
    const missingCredentialTest = await request(`/integration-connections/${unconfigured.data.connection.id}/test`, token, 'POST');
    assert.equal(missingCredentialTest.status, 200);
    assert.equal(missingCredentialTest.data.result.status, 'Not configured');
    assert.ok(missingCredentialTest.data.result.lastTestedAt);
    assert.equal(JSON.stringify(missingCredentialTest.data).includes(secret), false);
    assert.equal(JSON.stringify(await readFile(dataPath, 'utf8')).includes(secret), false);

    const email = providers.find((item) => item.connectorKey === 'EMAIL')!;
    const unsupportedConnection = await request('/integration-connections', token, 'POST', {
      connectorKey: 'EMAIL',
      name: 'Email connection',
      configuration: {},
      credentials: {}
    });
    const unsupportedTest = await request(`/integration-connections/${unsupportedConnection.data.connection.id}/test`, token, 'POST');
    assert.equal(unsupportedTest.data.result.status, 'Test unavailable');
    assert.ok(unsupportedTest.data.connection.lastTestedAt);

    const privateTestProvider = await request('/connector-providers/EMAIL', token, 'PUT', {
      ...email,
      baseUrl: 'https://127.0.0.1',
      test: { method: 'GET', path: '/status', expectedStatus: 200 }
    });
    assert.equal(privateTestProvider.status, 200, JSON.stringify(privateTestProvider.data));
    const privateEndpointTest = await request(`/integration-connections/${unsupportedConnection.data.connection.id}/test`, token, 'POST');
    assert.equal(privateEndpointTest.data.result.status, 'Failed');
    assert.match(privateEndpointTest.data.result.message, /safely/);
  } finally {
    if (child) await stopApi(child);
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
