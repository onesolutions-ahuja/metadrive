import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tenantId = 'flow-company-settings-smoke';
const adminEmail = 'admin@flow-company-settings-smoke.test';
const password = 'Flow-Company-Settings-Smoke-Password-2026!';

async function availablePort() {
  const server = createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Could not allocate a test port');
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function startApi(port, dataPath) {
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      METADRIVE_TEST_MODE: 'true',
      PORT: String(port),
      METADRIVE_DATA_PATH: dataPath,
      METADRIVE_BOOTSTRAP_TENANT_ID: tenantId,
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'Flow Company Settings Smoke',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: adminEmail,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password,
      METADRIVE_CREDENTIAL_KEYS: JSON.stringify({ 'test-key': Buffer.alloc(32, 9).toString('base64') }),
      METADRIVE_CREDENTIAL_ACTIVE_KEY_ID: 'test-key'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout?.on('data', chunk => { logs += chunk.toString(); });
  child.stderr?.on('data', chunk => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test API exited during startup:\n${logs}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return child;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  child.kill();
  throw new Error(`Test API did not become ready:\n${logs}`);
}

async function stopApi(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]);
}

test('Flow formula reads tenant VAT settings and rejects caller-supplied overrides', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-flow-company-settings-'));
  const port = await availablePort();
  let child;
  try {
    child = await startApi(port, path.join(directory, 'test-state.json'));
    const root = `http://127.0.0.1:${port}/api`;
    const send = async (pathName, token, method = 'GET', body) => {
      const response = await fetch(`${root}${pathName}`, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body ? { 'content-type': 'application/json' } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      const text = await response.text();
      return { status: response.status, data: text ? JSON.parse(text) : {} };
    };
    const login = await send('/auth/login', undefined, 'POST', { email: adminEmail, password });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const token = login.data.access_token;
    const settings = await send('/metadata/currencies', token, 'PUT', {
      corporateCurrency: 'GBP', standardVatRate: 17.5,
      currencies: [{ currencyIsoCode: 'GBP', conversionRate: 1 }]
    });
    assert.equal(settings.status, 200, JSON.stringify(settings.data));

    const apiName = 'Company_Settings_VAT_Smoke';
    const flow = {
      apiName, label: 'Company Settings VAT Smoke', description: '',
      flowType: 'Autolaunched Flow', status: 'Active',
      versionNumber: 1, activeVersion: 1, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Assignment', label: 'Capture VAT rate', config: {
          variable: 'VatResult', operator: 'Assign', value: '{!ConfiguredVatRate}'
        } },
        { id: 3, type: 'End', label: 'End', config: {} }
      ],
      connectors: [
        { id: 'start-assignment', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'assignment-end', from: 2, to: 3, label: '', kind: 'normal' }
      ],
      resources: [
        { name: 'ConfiguredVatRate', label: 'Configured VAT rate', type: 'Formula', dataType: 'Number',
          isCollection: false, availableForInput: false, availableForOutput: false,
          value: '{!$CompanySettings.StandardVatRate}' },
        { name: 'VatResult', label: 'VAT result', type: 'Variable', dataType: 'Number',
          isCollection: false, availableForInput: false, availableForOutput: true, value: 0 }
      ],
      versions: []
    };
    const validation = await send(`/metadata/flows/${apiName}/validate`, token, 'POST', flow);
    assert.equal(validation.status, 200, JSON.stringify(validation.data));
    assert.equal(validation.data.valid, true, JSON.stringify(validation.data.errors));
    const saved = await send(`/metadata/flows/${apiName}`, token, 'PUT', flow);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));

    const overridden = await send(`/flows/${apiName}/execute`, token, 'POST', { ConfiguredVatRate: 0 });
    assert.equal(overridden.status, 400, JSON.stringify(overridden.data));
    const executed = await send(`/flows/${apiName}/execute`, token, 'POST', {});
    assert.equal(executed.status, 200, JSON.stringify(executed.data));
    assert.equal(executed.data.outputs.VatResult, 17.5);

    // Optional POS installation and checkout have their own tenant-app smoke suite.

  } finally {
    if (child) await stopApi(child);
    await rm(directory, { recursive: true, force: true });
  }
});
