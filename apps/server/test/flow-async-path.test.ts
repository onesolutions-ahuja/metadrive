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

test('MD10 asynchronous record path: validation, durable dispatch, failure logging and isolation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-md10-async-'));
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
      const text = await response.text();
      return { status: response.status, data: text ? JSON.parse(text) as Record<string, any> : {} };
    };
    const auth = await send('/auth/login', undefined, 'POST', {
      email: 'admin@md10-async-proof.test', password: 'MD10-Async-Proof-2026-Password!'
    });
    assert.equal(auth.status, 200, JSON.stringify(auth.data));
    const token = auth.data.access_token as string;
    const definition = {
      apiName: 'MD10_Async_Path_Proof',
      label: 'MD10 Async Path Proof',
      flowType: 'Record-Triggered Flow',
      status: 'Active',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: 'Account',
      startConfig: {
        trigger: 'created', runWhen: 'after-save',
        entryConditions: [{ field: 'Name', operator: 'Equals', value: 'MD10 Queue Work' }]
      },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Create Records', label: 'Write Async Marker', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: 'MD10 Async Completed' }]
        } }
      ],
      connectors: [{ id: 'async-path', from: 1, to: 2, label: '', kind: 'async' }],
      resources: [], versions: []
    };

    for (const [label, change, expected] of [
      ['before-save', { startConfig: { ...definition.startConfig, runWhen: 'before-save' } }, 'after-save'],
      ['delete trigger', { startConfig: { ...definition.startConfig, trigger: 'deleted' } }, 'delete trigger'],
      ['wrong flow type', { flowType: 'Autolaunched Flow', triggerObject: null }, 'record-triggered'],
      ['extra async path', { connectors: [...definition.connectors,
        { id: 'async-path-2', from: 1, to: 2, label: '', kind: 'async' }] }, 'only one asynchronous path'],
      ['invalid scheduled settings', { connectors: [{
        ...definition.connectors[0],
        scheduledPath: { timeSourceFieldApiName: 'CreatedDate', offsetAmount: 0, offsetUnit: 'Hours' }
      }] }, 'cannot define scheduled-path settings']
    ] as Array<[string, Record<string, unknown>, string]>) {
      const validated = await send('/metadata/flows/MD10_Async_Path_Proof/validate', token, 'POST',
        { ...definition, ...change });
      assert.equal(validated.status, 200, label + ': ' + JSON.stringify(validated.data));
      assert.ok(validated.data.errors.some((error: string) => error.includes(expected)),
        label + ': ' + JSON.stringify(validated.data));
    }

    const saved = await send('/metadata/flows/MD10_Async_Path_Proof', token, 'PUT', definition);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.flow.activeVersion, 1);

    const triggered = await send('/records/Account', token, 'POST', { Name: 'MD10 Queue Work' });
    assert.equal(triggered.status, 201, JSON.stringify(triggered.data));
    let markerCount = 0;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const records = await send('/records/Account', token);
      assert.equal(records.status, 200);
      markerCount = records.data.records.filter((record: Record<string, unknown>) =>
        record.Name === 'MD10 Async Completed').length;
      if (markerCount) break;
      await new Promise(resolve => setTimeout(resolve, 125));
    }
    assert.equal(markerCount, 1, 'the queued path must execute via the persisted scheduler');
    await new Promise(resolve => setTimeout(resolve, 400));
    const recordsAfterDispatch = await send('/records/Account', token);
    assert.equal(recordsAfterDispatch.data.records.filter((record: Record<string, unknown>) =>
      record.Name === 'MD10 Async Completed').length, 1, 'a committed async path must not repeat');
    const pending = await send('/metadata/flow-interviews', token);
    assert.equal(pending.status, 200);
    assert.equal(pending.data.interviews.some((item: Record<string, unknown>) =>
      item.flowApiName === definition.apiName), false, 'completed async path must leave the queue');

    const bad = {
      ...definition,
      apiName: 'MD10_Async_Path_Error',
      label: 'MD10 Async Path Error',
      startConfig: {
        ...definition.startConfig,
        entryConditions: [{ field: 'Name', operator: 'Equals', value: 'MD10 Fail Async' }]
      },
      elements: [
        definition.elements[0],
        { id: 2, type: 'Create Records', label: 'Invalid Required Data', config: {
          object: 'Account', fieldValues: []
        } }
      ]
    };
    const savedBad = await send('/metadata/flows/MD10_Async_Path_Error', token, 'PUT', bad);
    assert.equal(savedBad.status, 200, JSON.stringify(savedBad.data));
    const errorTrigger = await send('/records/Account', token, 'POST', { Name: 'MD10 Fail Async' });
    assert.equal(errorTrigger.status, 201, JSON.stringify(errorTrigger.data));
    let asyncFailure: Record<string, unknown> | undefined;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const logs = await send('/metadata/flow-logs', token);
      asyncFailure = logs.data.logs.find((entry: Record<string, unknown>) =>
        entry.flowApiName === bad.apiName && entry.trigger === 'Async Path');
      if (asyncFailure) break;
      await new Promise(resolve => setTimeout(resolve, 125));
    }
    assert.ok(asyncFailure, 'asynchronous failure is visible in Flow Logs');
    const original = await send('/records/Account', token);
    assert.ok(original.data.records.some((record: Record<string, unknown>) =>
      record.Name === 'MD10 Fail Async'), 'async failure must not roll back committed trigger records');
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise(resolve => setTimeout(resolve, 5000))]);
    }
    await rm(directory, { recursive: true, force: true });
  }
});
