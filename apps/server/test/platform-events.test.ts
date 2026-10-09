import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const tsxCli = require.resolve('tsx/cli');
const serverDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tenantId = 'platform-events-smoke';
const adminEmail = 'admin@platform-events-smoke.test';
const password = 'Platform-Events-Smoke-Password-2026!';

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
      METADRIVE_BOOTSTRAP_TENANT_ID: tenantId,
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'Platform Events Smoke',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: adminEmail,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password,
      METADRIVE_SCHEDULE_POLL_MS: '100',
      METADRIVE_CREDENTIAL_KEYS: JSON.stringify({ 'test-key': Buffer.alloc(32, 5).toString('base64') }),
      METADRIVE_CREDENTIAL_ACTIVE_KEY_ID: 'test-key'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  child.stderr?.on('data', (chunk: Buffer) => { logs += chunk.toString(); });
  for (let attempt = 0; attempt < 600; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Test API exited during startup:\n${logs}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return child;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  child.kill();
  throw new Error(`Test API did not become ready:\n${logs}`);
}

async function stopApi(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    once(child, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 5000))
  ]);
}

test('Platform Events dispatch to matching subscribers and recover pending deliveries after restart', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-platform-events-'));
  const port = await availablePort();
  const dataPath = path.join(directory, 'platform-state.json');
  let child: ChildProcess | undefined;
  try {
    child = await startApi(port, dataPath);
    const root = `http://127.0.0.1:${port}/api`;
    const send = async (pathName: string, token?: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`${root}${pathName}`, {
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

    const login = await send('/auth/login', undefined, 'POST', { email: adminEmail, password });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    let token = login.data.access_token as string;
    assert.equal((await send('/metadata/platform-events')).status, 401,
      'event metadata APIs require an authenticated tenant principal');
    const authenticatedUser = await send('/auth/me', token);
    assert.equal(authenticatedUser.status, 200, JSON.stringify(authenticatedUser.data));
    const eventDefinition = {
      apiName: 'Signal_Smoke__e',
      label: 'Signal Smoke',
      description: 'Flow integration test event',
      fields: [
        { apiName: 'Signal__c', label: 'Signal', dataType: 'Text(255)', required: false, unique: false },
        {
          apiName: 'Severity__c', label: 'Severity', dataType: 'Picklist', required: false, unique: false,
          picklistRestricted: true, picklistValues: ['Low', 'High']
        }
      ]
    };
    const event = await send(`/metadata/platform-events/${eventDefinition.apiName}`, token, 'PUT', eventDefinition);
    assert.equal(event.status, 201, JSON.stringify(event.data));
    assert.equal((await send('/metadata/platform-events', token)).data.platformEvents.length, 1);
    const invalidEvent = await send('/metadata/platform-events/Invalid__e', token, 'PUT', {
      ...eventDefinition,
      apiName: 'Invalid__e',
      fields: [
        eventDefinition.fields[0],
        { ...eventDefinition.fields[0], label: 'Duplicate' }
      ]
    });
    assert.equal(invalidEvent.status, 400);

    const createSubscriber = async (apiName: string, label: string, conditionValue: string, accountName: string) => send(
      `/metadata/flows/${apiName}`, token, 'PUT', {
        apiName,
        label,
        flowType: 'Platform Event-Triggered Flow',
        status: 'Active',
        versionNumber: 1,
        activeVersion: null,
        triggerObject: eventDefinition.apiName,
        startConfig: {
          entryConditions: [{ field: 'Signal__c', operator: 'Equals', value: conditionValue }]
        },
        elements: [
          { id: 1, type: 'Start', label: 'Start', config: {} },
          { id: 2, type: 'Create Records', label: 'Create Subscriber Account', config: {
            object: 'Account',
            fieldValues: [{ field: 'Name', value: accountName }]
          } }
        ],
        connectors: [{ id: `start-${apiName}`, from: 1, to: 2, label: '', kind: 'normal' }],
        resources: [],
        versions: []
      }
    );
    const matchingSubscriber = await createSubscriber(
      'Signal_Matching_Subscriber', 'Signal Matching Subscriber', 'run', '{!$Record.Signal__c}'
    );
    assert.equal(matchingSubscriber.status, 200, JSON.stringify(matchingSubscriber.data));
    const nonMatchingSubscriber = await createSubscriber(
      'Signal_Nonmatching_Subscriber', 'Signal Nonmatching Subscriber', 'skip', 'Must Not Be Created'
    );
    assert.equal(nonMatchingSubscriber.status, 200, JSON.stringify(nonMatchingSubscriber.data));

    const publisher = await send('/metadata/flows/Signal_Publisher', token, 'PUT', {
      apiName: 'Signal_Publisher',
      label: 'Signal Publisher',
      flowType: 'Autolaunched Flow',
      status: 'Active',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: null,
      startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Publish Platform Event', label: 'Publish Signal', config: {
          eventApiName: eventDefinition.apiName,
          fieldValues: [{ field: 'Signal__c', value: 'run' }]
        } }
      ],
      connectors: [{ id: 'start-publish', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [],
      versions: []
    });
    assert.equal(publisher.status, 200, JSON.stringify(publisher.data));
    const invalidPicklistPublisher = await send('/metadata/flows/Signal_Invalid_Picklist_Publisher', token, 'PUT', {
      apiName: 'Signal_Invalid_Picklist_Publisher',
      label: 'Signal Invalid Picklist Publisher',
      flowType: 'Autolaunched Flow',
      status: 'Active',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: null,
      startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Publish Platform Event', label: 'Publish Invalid Severity', config: {
          eventApiName: eventDefinition.apiName,
          fieldValues: [{ field: 'Severity__c', value: 'Urgent' }]
        } }
      ],
      connectors: [{ id: 'start-invalid-publish', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [],
      versions: []
    });
    assert.equal(invalidPicklistPublisher.status, 200, JSON.stringify(invalidPicklistPublisher.data));
    const messagesBeforeInvalidPicklist = JSON.parse(await readFile(dataPath, 'utf8')).tenants[tenantId].platformEventMessages.length as number;
    const invalidPicklistExecution = await send('/flows/Signal_Invalid_Picklist_Publisher/execute', token, 'POST', {});
    assert.equal(invalidPicklistExecution.status, 422, JSON.stringify(invalidPicklistExecution.data));
    const messagesAfterInvalidPicklist = JSON.parse(await readFile(dataPath, 'utf8')).tenants[tenantId].platformEventMessages.length as number;
    assert.equal(messagesAfterInvalidPicklist, messagesBeforeInvalidPicklist,
      'invalid event field values must be rejected without publishing');
    const published = await send('/flows/Signal_Publisher/execute', token, 'POST', {});
    assert.equal(published.status, 200, JSON.stringify(published.data));

    let accounts: Record<string, unknown>[] = [];
    for (let attempt = 0; attempt < 50; attempt += 1) {
      accounts = (await send('/records/Account', token)).data.records as Record<string, unknown>[];
      if (accounts.some((record) => record.Name === 'run')) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(accounts.filter((record) => record.Name === 'run').length, 1,
      'the event payload must reach an active subscriber that matches its start criteria');
    assert.equal(accounts.some((record) => record.Name === 'Must Not Be Created'), false,
      'a subscriber whose start criteria do not match must not execute');

    const blockedDeletion = await send(`/metadata/platform-events/${eventDefinition.apiName}`, token, 'DELETE');
    assert.equal(blockedDeletion.status, 409,
      'platform event definitions referenced by active or publishing flows cannot be removed');
    const failedPublisher = await send('/metadata/flows/Signal_Rolled_Back_Publisher', token, 'PUT', {
      apiName: 'Signal_Rolled_Back_Publisher',
      label: 'Signal Rolled Back Publisher',
      flowType: 'Autolaunched Flow',
      status: 'Active',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: null,
      startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Publish Platform Event', label: 'Publish Before Failure', config: {
          eventApiName: eventDefinition.apiName,
          fieldValues: [{ field: 'Signal__c', value: 'rolled-back' }]
        } },
        { id: 3, type: 'Create Records', label: 'Fail Transaction', config: {
          object: 'Account',
          fieldValues: [{ field: 'Name', value: 'Publisher Must Roll Back' }, { field: 'AnnualRevenue', value: 'invalid' }]
        } }
      ],
      connectors: [
        { id: 'start-publish-before-failure', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'publish-failure', from: 2, to: 3, label: '', kind: 'normal' }
      ],
      resources: [],
      versions: []
    });
    assert.equal(failedPublisher.status, 200, JSON.stringify(failedPublisher.data));
    const queuedMessagesBeforeFailure = JSON.parse(await readFile(dataPath, 'utf8')).tenants[tenantId].platformEventMessages.length as number;
    const failedPublishExecution = await send('/flows/Signal_Rolled_Back_Publisher/execute', token, 'POST', {});
    assert.equal(failedPublishExecution.status, 422, JSON.stringify(failedPublishExecution.data));
    const queuedMessagesAfterFailure = JSON.parse(await readFile(dataPath, 'utf8')).tenants[tenantId].platformEventMessages.length as number;
    assert.equal(queuedMessagesAfterFailure, queuedMessagesBeforeFailure,
      'events published in a failed Flow transaction must not be committed');

    const failedSubscriber = await send('/metadata/flows/Signal_Failure_Subscriber', token, 'PUT', {
      apiName: 'Signal_Failure_Subscriber',
      label: 'Signal Failure Subscriber',
      flowType: 'Platform Event-Triggered Flow',
      status: 'Active',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: eventDefinition.apiName,
      startConfig: { entryConditions: [{ field: 'Signal__c', operator: 'Equals', value: 'fail' }] },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Create Records', label: 'Fail on Invalid Number', config: {
          object: 'Account',
          fieldValues: [{ field: 'Name', value: 'Must Not Be Persisted' }, { field: 'AnnualRevenue', value: 'invalid' }]
        } }
      ],
      connectors: [{ id: 'start-failure', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [],
      versions: []
    });
    assert.equal(failedSubscriber.status, 200, JSON.stringify(failedSubscriber.data));
    const retrySubscriber = await send('/metadata/flows/Signal_Retry_Subscriber', token, 'PUT', {
      apiName: 'Signal_Retry_Subscriber',
      label: 'Signal Retry Subscriber',
      flowType: 'Platform Event-Triggered Flow',
      status: 'Active',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: eventDefinition.apiName,
      startConfig: { entryConditions: [{ field: 'Signal__c', operator: 'Equals', value: 'retry' }] },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Create Records', label: 'Fail and Retry', config: {
          object: 'Account',
          fieldValues: [{ field: 'Name', value: 'Must Not Be Persisted' }, { field: 'AnnualRevenue', value: 'invalid' }]
        } }
      ],
      connectors: [{ id: 'start-retry', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [],
      versions: []
    });
    assert.equal(retrySubscriber.status, 200, JSON.stringify(retrySubscriber.data));

    await stopApi(child);
    child = undefined;
    const stored = JSON.parse(await readFile(dataPath, 'utf8')) as {
      tenants: Record<string, { platformEventMessages: unknown[] }>;
    };
    const tenant = stored.tenants[tenantId] as {
      platformEventMessages: Array<Record<string, unknown>>;
    };
    const publishPending = (signal: string, attempts: number) => ({
      id: randomUUID(),
      eventApiName: eventDefinition.apiName,
      payload: { Signal__c: signal, Id: randomUUID(), EventUuid: randomUUID(), ReplayId: 'restart-test' },
      createdAt: new Date().toISOString(),
      publishedBy: authenticatedUser.data.user.id as string,
      deliveredFlowApiNames: [],
      attempts,
      retryAt: null,
      lastError: '',
      processedAt: null,
      deadLettered: false
    });
    tenant.platformEventMessages.push(publishPending('run', 0));
    tenant.platformEventMessages.push(publishPending('retry', 0));
    tenant.platformEventMessages.push({
      ...publishPending('fail', 9),
      retryAt: new Date(Date.now() - 1000).toISOString()
    });
    await writeFile(dataPath, JSON.stringify(stored, null, 2), 'utf8');

    child = await startApi(port, dataPath);
    const restartedLogin = await send('/auth/login', undefined, 'POST', { email: adminEmail, password });
    assert.equal(restartedLogin.status, 200, JSON.stringify(restartedLogin.data));
    token = restartedLogin.data.access_token as string;
    let restartDelivered = false;
    let deadLettered = false;
    let retryScheduled = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      accounts = (await send('/records/Account', token)).data.records as Record<string, unknown>[];
      const persisted = JSON.parse(await readFile(dataPath, 'utf8')) as typeof stored;
      const persistedMessages = (persisted.tenants[tenantId] as { platformEventMessages: Array<Record<string, unknown>> })
        .platformEventMessages;
      restartDelivered = accounts.some((record) => record.Name === 'run');
      deadLettered = persistedMessages.some((message) => message.deadLettered === true && message.attempts === 10);
      retryScheduled = persistedMessages.some((message) => message.attempts === 1
        && typeof message.retryAt === 'string' && Date.parse(message.retryAt) > Date.now());
      if (restartDelivered && deadLettered && retryScheduled) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(restartDelivered, true, 'a queued event present before restart must be delivered after restart');
    assert.equal(deadLettered, true, 'a repeatedly failing subscriber must reach the dead-letter state');
    assert.equal(retryScheduled, true, 'a transient delivery failure must persist a future retry time');
    assert.equal(accounts.some((record) => record.Name === 'Must Not Be Persisted'), false,
      'failed subscriber transactions must not commit partial records');
  } finally {
    if (child) await stopApi(child);
    await rm(directory, { recursive: true, force: true });
  }
});
