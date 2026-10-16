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
async function port(): Promise<number> {
  const socket = createServer();
  socket.listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('No port');
  return new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve(address.port)));
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([once(child, 'exit'), new Promise((resolve) => setTimeout(resolve, 4000))]);
}
test('MD-05: tenant-scoped object metadata revisions, preflight, audit and restart durability', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'metadrive-md05-'));
  const listenPort = await port();
  const email = 'metadata-owner@example.test';
  const password = 'ObjectManagerTest!2026';
  const platformKey = 'object-manager-platform-bootstrap-key';
  const base = `http://127.0.0.1:${listenPort}`;
  const env = {
    ...process.env, NODE_ENV: 'test', METADRIVE_TEST_MODE: 'true',
    PORT: String(listenPort), METADRIVE_DATA_PATH: path.join(dir, 'platform.json'),
    METADRIVE_BOOTSTRAP_TENANT_ID: 'tenant-a', METADRIVE_BOOTSTRAP_TENANT_NAME: 'Tenant A',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL: email, METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password,
    METADRIVE_PLATFORM_BOOTSTRAP_EMAIL: email, METADRIVE_PLATFORM_BOOTSTRAP_KEY: platformKey
  };
  let child: ChildProcess | null = null;
  let logs = '';
  const start = async () => {
    child = spawn(process.execPath, [tsxCli, 'src/index.ts'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (b: Buffer) => { logs += b.toString(); });
    child.stderr?.on('data', (b: Buffer) => { logs += b.toString(); });
    for (let n = 0; n < 300; n++) {
      if (child.exitCode !== null) throw Error('Failed to start: ' + logs.slice(-2000));
      try {
        if ((await fetch(base + '/health', { signal: AbortSignal.timeout(400) })).ok) return;
      } catch { /* server launching */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error('Startup timeout: ' + logs.slice(-2000));
  };
  const call = async (route: string, token = '', method = 'GET', body?: unknown, headers: Record<string, string> = {}) => {
    const response = await fetch(base + '/api' + route, {
      method,
      headers: {
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    return { status: response.status, data: text ? JSON.parse(text) as Record<string, any> : {},
      etag: response.headers.get('etag') };
  };
  const login = async (userEmail: string, userPassword: string) => {
    const result = await call('/auth/login', '', 'POST', { email: userEmail, password: userPassword });
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return String(result.data.access_token);
  };
  try {
    await start();
    assert.equal((await call('/metadata/objects/Task__c/history')).status, 401);
    const token = await login(email, password);
    const root = '/metadata/objects';
    const created = await call(root, token, 'POST', {
      apiName: 'Task__c', label: 'Task', pluralLabel: 'Tasks', kind: 'Custom Object',
      description: 'A tenant scoped metadata object',
      fields: [{ apiName: 'Name', label: 'Task Name', dataType: 'Text(80)', required: true, unique: false }]
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
    assert.equal(created.data.object.revision, 1);
    assert.equal((await call(root + '/Task__c', token)).etag, '"1"');
    const updated = await call(root + '/Task__c', token, 'PUT',
      { ...created.data.object, label: 'Updated Task' }, { 'If-Match': '"1"' });
    assert.equal(updated.status, 200, JSON.stringify(updated.data));
    assert.equal(updated.data.object.revision, 2);
    const stale = await call(root + '/Task__c', token, 'PUT',
      { ...created.data.object, label: 'Stale overwrite' }, { 'If-Match': '"1"' });
    assert.equal(stale.status, 412);
    assert.equal((await call(root + '/Task__c', token)).data.object.label, 'Updated Task');
    const field = await call(root + '/Task__c/fields', token, 'POST',
      { apiName: 'Extra__c', label: 'Extra', dataType: 'Text(60)', required: false, unique: false },
      { 'If-Match': '"2"' });
    assert.equal(field.status, 201, JSON.stringify(field.data));
    assert.equal(field.data.object.revision, 3);
    assert.equal((await call(root + '/Task__c/fields/Extra__c', token, 'DELETE', undefined,
      { 'If-Match': '"2"' })).status, 412);
    const deleted = await call(root + '/Task__c/fields/Extra__c', token, 'DELETE', undefined,
      { 'If-Match': '"3"' });
    assert.equal(deleted.status, 200, JSON.stringify(deleted.data));
    assert.equal(deleted.data.object.revision, 4);
    const preview = await call(root + '/Task__c/validate', token, 'POST', deleted.data.object,
      { 'If-Match': '"4"' });
    assert.equal(preview.status, 200, JSON.stringify(preview.data));
    assert.equal(preview.data.valid, true);
    const badPreview = await call(root + '/Task__c/validate', token, 'POST',
      { ...deleted.data.object, fields: [] }, { 'If-Match': '"4"' });
    assert.equal(badPreview.status, 422);
    assert.equal(badPreview.data.valid, false);
    let history = await call(root + '/Task__c/history', token);
    assert.equal(history.status, 200, JSON.stringify(history.data));
    assert.equal(history.data.history.length, 4);
    assert.deepEqual(history.data.history.map((x: { revision: number }) => x.revision), [4, 3, 2, 1]);
    assert.equal(history.data.history[0].action, 'FIELD_DELETED');
    const snapshot = await call(root + '/Task__c/history/2', token);
    assert.equal(snapshot.data.change.before.label, 'Task');
    assert.equal(snapshot.data.change.after.label, 'Updated Task');
    assert.equal((await call(root + '/Task__c/history?limit=500', token)).status, 400);
    assert.equal((await call(root + '/Task__c/history/999', token)).status, 404);

    // Isolate metadata and change history across tenant credentials.
    assert.equal((await call('/platform/policies/bootstrap', token, 'POST', {},
      { 'x-platform-bootstrap-key': platformKey })).status, 200);
    const provision = await call('/platform/tenants', token, 'POST', {
      tenantId: 'tenant-b', tenantName: 'Tenant B', adminName: 'Tenant B Admin',
      email: 'metadata-b@example.test', password: password
    });
    assert.equal(provision.status, 201, JSON.stringify(provision.data));
    const tokenB = await login('metadata-b@example.test', password);
    assert.equal((await call(root + '/Task__c', tokenB)).status, 404);
    assert.equal((await call(root + '/Task__c/history', tokenB)).status, 404);
    assert.equal((await call(root + '/Task__c', token)).data.object.revision, 4);
    await stop(child!);
    await start();
    const newToken = await login(email, password);
    history = await call(root + '/Task__c/history', newToken);
    assert.equal(history.data.history.length, 4, JSON.stringify(history.data));
    assert.equal((await call(root + '/Task__c', newToken)).data.object.revision, 4);
  } finally {
    if (child) await stop(child);
    await rm(dir, { recursive: true, force: true });
  }
});
