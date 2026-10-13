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


test('MD10 record trigger debug: creation, update, entry checks, prior context and side-effect isolation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-md10-debug-record-'));
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
    assert.equal(auth.status, 200, JSON.stringify(auth.data));
    const token = auth.data.access_token as string;
    const definition = {
      apiName: 'MD10_Record_Debug_Proof',
      label: 'MD10 Record Debug Proof',
      flowType: 'Record-Triggered Flow',
      status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: 'Account',
      startConfig: {
        trigger: 'created-or-updated', runWhen: 'after-save',
        entryConditions: [{ field: 'Name', operator: 'Equals', value: 'MD10 Debug Eligible' }],
        updatedRecordBehavior: 'transition'
      },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Create Records', label: 'Create Debug Marker', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: 'MD10 SIMULATED WRITE' }]
        } }
      ],
      connectors: [{ id: 'main', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    };
    const saved = await send('/metadata/flows/MD10_Record_Debug_Proof', token, 'PUT', definition);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    const run = (body: unknown) => send('/flows/MD10_Record_Debug_Proof/debug-record', token, 'POST', body);
    const created = await run({ event: 'created', record: { Id: 'TEST-1', Name: 'MD10 Debug Eligible' } });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.status, 'completed');
    assert.equal(created.data.sideEffectsSimulated, true);
    assert.ok(created.data.debugTrace.some((element: Record<string, unknown>) => element.type === 'Create Records'));
    const skipped = await run({ event: 'created', record: { Id: 'TEST-1', Name: 'MD10 Debug Ineligible' } });
    assert.equal(skipped.status, 200);
    assert.equal(skipped.data.status, 'skipped');
    assert.deepEqual(skipped.data.debugTrace, []);
    const update = await run({
      event: 'updated',
      record: { Id: 'TEST-1', Name: 'MD10 Debug Eligible' },
      prior: { Id: 'TEST-1', Name: 'MD10 Debug Ineligible' }
    });
    assert.equal(update.status, 200, JSON.stringify(update.data));
    assert.equal(update.data.status, 'completed');
    const unchanged = await run({
      event: 'updated',
      record: { Id: 'TEST-1', Name: 'MD10 Debug Eligible' },
      prior: { Id: 'TEST-1', Name: 'MD10 Debug Eligible' }
    });
    assert.equal(unchanged.status, 200, JSON.stringify(unchanged.data));
    assert.equal(unchanged.data.status, 'skipped');
    assert.match(unchanged.data.reason, /before this update/);
    const missingPrior = await run({ event: 'updated', record: { Id: 'TEST-1', Name: 'MD10 Debug Eligible' } });
    assert.equal(missingPrior.status, 400);
    const secretField = await run({ event: 'created', record: { Id: 'TEST-1', UnknownField__c: 'secret' } });
    assert.equal(secretField.status, 400);
    const persisted = await send('/records/Account', token);
    assert.equal(persisted.status, 200);
    assert.ok(!persisted.data.records.some((record: Record<string, unknown>) => record.Name === 'MD10 SIMULATED WRITE'),
      'debug must never persist created records');
    const interviews = await send('/metadata/flow-interviews', token);
    assert.equal(interviews.status, 200);
    assert.equal(interviews.data.interviews.filter((interview: Record<string, unknown>) =>
      interview.flowApiName === definition.apiName).length, 0, 'debug cannot persist interviews');
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    await rm(directory, { recursive: true, force: true });
  }
});
