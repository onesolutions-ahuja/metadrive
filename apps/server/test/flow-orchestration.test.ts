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


test('MD10 orchestration: metadata validation, approval stages, durable resume and cancellation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-md10-orchestration-'));
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
    const access = await send('/metadata/permissions', token);
    assert.equal(access.status, 200, JSON.stringify(access.data));
    const approverId = access.data.users.find((item: Record<string, unknown>) =>
      item.username === 'admin@md10-async-proof.test')?.id as string;
    assert.ok(approverId);
    const target = await send('/records/Account', token, 'POST', { Name: 'Orchestration Target' });
    assert.equal(target.status, 201, JSON.stringify(target.data));
    const targetId = target.data.record.Id as string;
    const definition = {
      apiName: 'MD10_Orchestration_Proof',
      label: 'MD10 Orchestration Proof',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Orchestration Stage', label: 'First Approval', config: {
          objectApiName: 'Account', recordId: '{!TargetId}', approverIds: approverId,
          approvalMode: 'ANY', statusVariable: 'DecisionStatus'
        } },
        { id: 3, type: 'Orchestration Stage', label: 'Second Approval', config: {
          objectApiName: 'Account', recordId: '{!TargetId}', approverIds: approverId,
          approvalMode: 'ALL', statusVariable: 'DecisionStatus'
        } },
        { id: 4, type: 'Create Records', label: 'Completed', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: '{!DecisionStatus}' }]
        } },
        { id: 5, type: 'Create Records', label: 'Rejected', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: 'Orchestration Rejected' }]
        } }
      ],
      connectors: [
        { id: 'start', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'first-yes', from: 2, to: 3, label: 'Approved', kind: 'normal' },
        { id: 'first-no', from: 2, to: 5, label: 'Rejected', kind: 'normal' },
        { id: 'second-yes', from: 3, to: 4, label: 'Approved', kind: 'normal' },
        { id: 'second-no', from: 3, to: 5, label: 'Rejected', kind: 'normal' }
      ],
      resources: [
        { name: 'TargetId', label: 'Target ID', type: 'Variable', dataType: 'Text',
          isCollection: false, availableForInput: true, availableForOutput: false },
        { name: 'DecisionStatus', label: 'Decision Status', type: 'Variable', dataType: 'Text',
          isCollection: false, availableForInput: false, availableForOutput: true }
      ], versions: []
    };
    const invalid = await send('/metadata/flows/MD10_Orchestration_Proof/validate', token, 'POST', {
      ...definition, connectors: definition.connectors.filter((edge) => edge.id !== 'first-no')
    });
    assert.equal(invalid.status, 200, JSON.stringify(invalid.data));
    assert.ok(invalid.data.errors.some((error: string) => error.includes('exactly one Rejected connector')),
      JSON.stringify(invalid.data));
    const saved = await send('/metadata/flows/MD10_Orchestration_Proof', token, 'PUT', definition);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));

    const launched = await send('/flows/MD10_Orchestration_Proof/execute', token, 'POST', { TargetId: targetId });
    assert.equal(launched.status, 202, JSON.stringify(launched.data));
    const interviews = await send('/metadata/flow-interviews', token);
    assert.equal(interviews.status, 200);
    assert.ok(interviews.data.interviews.some((item: Record<string, unknown>) =>
      item.id === launched.data.interviewId && item.kind === 'orchestration'),
      'first stage pauses durably');
    const firstInbox = await send('/approvals/inbox', token);
    assert.equal(firstInbox.status, 200);
    const firstApproval = firstInbox.data.requests.find((item: Record<string, unknown>) =>
      item.flowApiName === definition.apiName);
    assert.ok(firstApproval);
    assert.equal(firstApproval.approvalMode, 'ANY');
    const decided = await send(`/approvals/${firstApproval.id}/decision`, token, 'POST', {
      decision: 'Approved', comments: 'First stage complete'
    });
    assert.equal(decided.status, 200, JSON.stringify(decided.data));
    assert.equal((await send(`/approvals/${firstApproval.id}/decision`, token, 'POST', {
      decision: 'Rejected'
    })).status, 404, 'a decision cannot be replayed');

    let secondApproval: Record<string, unknown> | undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const inbox = await send('/approvals/inbox', token);
      secondApproval = inbox.data.requests.find((item: Record<string, unknown>) =>
        item.flowApiName === definition.apiName && item.id !== firstApproval.id);
      if (secondApproval) break;
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
    assert.ok(secondApproval, 'second stage should launch automatically after first approval');
    assert.equal(secondApproval.approvalMode, 'ALL');
    const secondDecision = await send(`/approvals/${secondApproval.id}/decision`, token, 'POST', {
      decision: 'Approved', comments: 'Second stage complete'
    });
    assert.equal(secondDecision.status, 200, JSON.stringify(secondDecision.data));

    let completeCount = 0;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const result = await send('/records/Account', token);
      completeCount = result.data.records.filter((record: Record<string, unknown>) =>
        record.Name === 'Approved').length;
      if (completeCount) break;
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
    assert.equal(completeCount, 1, 'both stages should execute once, preserving the approval outcome variable');
    await new Promise((resolve) => setTimeout(resolve, 350));
    const records = await send('/records/Account', token);
    assert.equal(records.data.records.filter((record: Record<string, unknown>) => record.Name === 'Approved').length, 1);
    assert.equal((await send('/metadata/flow-interviews', token)).data.interviews
      .filter((item: Record<string, unknown>) => item.flowApiName === definition.apiName).length, 0);

    const cancelRun = await send('/flows/MD10_Orchestration_Proof/execute', token, 'POST', { TargetId: targetId });
    assert.equal(cancelRun.status, 202);
    assert.equal((await send(`/metadata/flow-interviews/${cancelRun.data.interviewId}`, token, 'DELETE')).status, 204);
    const afterCancel = await send('/approvals/inbox', token);
    assert.equal(afterCancel.data.requests.some((item: Record<string, unknown>) =>
      item.flowApiName === definition.apiName), false, 'cancellation removes orphaned pending work items');
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 5000))]);
    }
    await rm(directory, { recursive: true, force: true });
  }
});
