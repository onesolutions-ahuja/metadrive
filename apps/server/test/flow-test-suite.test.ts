import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function freePort(): Promise<number> {
  const listener = createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const address = listener.address();
  if (!address || typeof address === 'string') throw Error('No test port');
  await new Promise<void>((resolve, reject) => listener.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function boot(port: number, dataPath: string): Promise<ChildProcess> {
  const child = spawn(process.execPath, [tsxCli, 'src/index.ts'], {
    cwd: serverDirectory,
    env: {
      ...process.env,
      PORT: String(port),
      METADRIVE_DATA_PATH: dataPath,
      METADRIVE_BOOTSTRAP_TENANT_ID: 'md10-async-proof',
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'MD10 Async Proof',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: 'admin@md10-async-proof.test',
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: 'MD10-Async-Proof-2026-Password!',
      METADRIVE_SCHEDULE_POLL_MS: '150',
      METADRIVE_CREDENTIAL_KEYS: JSON.stringify({ 'test-key': Buffer.alloc(32, 4).toString('base64') }),
      METADRIVE_CREDENTIAL_ACTIVE_KEY_ID: 'test-key'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let diagnostics = '';
  child.stdout?.on('data', (chunk: Buffer) => { diagnostics += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { diagnostics += chunk.toString(); });
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (child.exitCode !== null) throw Error('API exited:\n' + diagnostics);
    try {
      const healthy = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
      if (healthy.ok) return child;
    } catch { /* Still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill();
  throw Error('API startup timed out:\n' + diagnostics);
}


test('MD10 Flow Tests: persist versioned metadata, reject invalid record fixtures and round-trip expected outputs', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-md10-tests-'));
  const port = await freePort();
  let child: ChildProcess | undefined;
  try {
    child = await boot(port, path.join(directory, 'state.json'));
    const base = `http://127.0.0.1:${port}/api`;
    const send = async (route: string, token?: string, method = 'GET', body?: unknown) => {
      const response = await fetch(base + route, {
        method,
        headers: {
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(body !== undefined ? { 'content-type': 'application/json' } : {})
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
      const value = await response.text();
      return { status: response.status, data: value ? JSON.parse(value) as Record<string, any> : {} };
    };
    const auth = await send('/auth/login', undefined, 'POST', {
      email: 'admin@md10-async-proof.test', password: 'MD10-Async-Proof-2026-Password!'
    });
    assert.equal(auth.status, 200);
    const token = auth.data.access_token as string;
    const flow = {
      apiName: 'MD10_Saved_Test_Proof',
      label: 'MD10 Saved Test Proof',
      flowType: 'Autolaunched Flow',
      status: 'Draft', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [{ id: 1, type: 'Start', label: 'Start', config: {} }],
      connectors: [], resources: [], versions: [],
      tests: [{
        id: '07676c23-4cbe-48de-93e2-6ff81129c770',
        label: 'Completes without side effects', input: {},
        expectedStatus: 'completed', expectedOutputs: {}
      }]
    };
    const saved = await send('/metadata/flows/MD10_Saved_Test_Proof', token, 'PUT', flow);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.flow.tests.length, 1);
    const retrieved = await send('/metadata/flows', token);
    assert.equal(retrieved.status, 200);
    const exact = retrieved.data.flows.find((item: Record<string, unknown>) => item.apiName === flow.apiName);
    assert.ok(exact);
    assert.deepEqual(exact.tests, saved.data.flow.tests, 'test fixtures must round-trip without data loss');
    const noRunAccess = await send('/metadata/flows', undefined);
    assert.equal(noRunAccess.status, 401, 'tests must be tenant-authenticated metadata');
    const duplicate = await send('/metadata/flows/MD10_Saved_Test_Proof', token, 'PUT', {
      ...flow, tests: [flow.tests[0], flow.tests[0]]
    });
    assert.equal(duplicate.status, 400, 'duplicate test IDs must fail closed');
    const recordFlow = {
      ...flow, apiName: 'MD10_Bad_Record_Fixture', flowType: 'Record-Triggered Flow',
      triggerObject: 'Account',
      startConfig: { trigger: 'created', runWhen: 'after-save' },
      tests: [{ ...flow.tests[0], record: { Id: 'TEST-A', Name: 'Sample' } }]
    };
    const invalid = await send('/metadata/flows/MD10_Bad_Record_Fixture', token, 'PUT', recordFlow);
    assert.equal(invalid.status, 400, 'record-triggered tests require an explicit event');
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    await rm(directory, { recursive: true, force: true });
  }
});
