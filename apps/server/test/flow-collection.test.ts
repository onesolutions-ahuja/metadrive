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
const tenantId = 'flow-collection-smoke';
const adminEmail = 'admin@flow-collection-smoke.test';
const password = 'Flow-Collection-Smoke-Password-2026!';

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
      METADRIVE_BOOTSTRAP_TENANT_NAME: 'Flow Collection Smoke',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL: adminEmail,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD: password,
      METADRIVE_SCHEDULE_POLL_MS: '100',
      METADRIVE_CREDENTIAL_KEYS: JSON.stringify({ 'test-key': Buffer.alloc(32, 9).toString('base64') }),
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

test('Collection Filter and Collection Sort execute and validate record collections', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'metadrive-flow-collection-'));
  const port = await availablePort();
  let child: ChildProcess | undefined;
  try {
    child = await startApi(port, path.join(directory, 'platform-state.json'));
    const root = `http://127.0.0.1:${port}/api`;
    const send = async (pathName: string, token?: string, method = 'GET', body?: unknown) => {
      const response = await fetch(`${root}${pathName}`, {
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
    const login = await send('/auth/login', undefined, 'POST', { email: adminEmail, password });
    assert.equal(login.status, 200, JSON.stringify(login.data));
    const token = login.data.access_token as string;
    const scheduledPathAccountMetadata = await send('/metadata/objects/Account', token);
    assert.equal(scheduledPathAccountMetadata.status, 200, JSON.stringify(scheduledPathAccountMetadata.data));
    const scheduledPathObject = {
      ...scheduledPathAccountMetadata.data.object,
      fields: [...scheduledPathAccountMetadata.data.object.fields, {
        apiName: 'Scheduled_Path_At__c', label: 'Scheduled Path At', dataType: 'DateTime',
        required: false, unique: false
      }]
    };
    const savedScheduledPathObject = await send('/metadata/objects/Account', token, 'PUT', scheduledPathObject);
    assert.equal(savedScheduledPathObject.status, 200, JSON.stringify(savedScheduledPathObject.data));
    for (const Name of ['Flow Collection Alpha 2', 'Flow Collection Beta', 'Flow Collection Alpha 1', 'Flow Collection Gamma']) {
      const created = await send('/records/Account', token, 'POST', { Name });
      assert.equal(created.status, 201, JSON.stringify(created.data));
    }
    const flowAccessRecord = await send('/records/Account', token, 'POST', { Name: 'Flow Access Target' });
    assert.equal(flowAccessRecord.status, 201, JSON.stringify(flowAccessRecord.data));
    const flowAccessFlow = await send('/metadata/flows/Flow_Data_Access_Smoke', token, 'PUT', {
      apiName: 'Flow_Data_Access_Smoke', label: 'Flow Data Access Smoke',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Get Records', label: 'Read Accounts', config: {
          object: 'Account', conditions: [{ field: 'Name', operator: 'Equals', value: 'Flow Access Target' }],
          fields: ['Name'], outputVariable: 'AccessibleAccounts', recordLimit: 'all'
        } }
      ],
      connectors: [{ id: 'start-get', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [{
        name: 'AccessibleAccounts', label: 'Accessible Accounts', type: 'Record Collection',
        dataType: 'Account', isCollection: true, availableForInput: false, availableForOutput: true
      }],
      versions: []
    });
    assert.equal(flowAccessFlow.status, 200, JSON.stringify(flowAccessFlow.data));
    const flowAccessRead = await send('/flows/Flow_Data_Access_Smoke/execute', token, 'POST', {});
    assert.equal(flowAccessRead.status, 200, JSON.stringify(flowAccessRead.data));
    assert.equal(flowAccessRead.data.outputs.AccessibleAccounts.length, 1,
      'Get Records returns records readable to the Flow running user');
    const originalAccessControl = await send('/metadata/permissions', token);
    assert.equal(originalAccessControl.status, 200, JSON.stringify(originalAccessControl.data));
    const adminAccessUser = originalAccessControl.data.users.find((user: Record<string, unknown>) =>
      user.username === adminEmail);
    assert.ok(adminAccessUser, 'the Flow running user must be present in access metadata');
    const adminProfileId = String(adminAccessUser.profileId ?? 'system-administrator');
    const adminProfile = originalAccessControl.data.profiles.find((profile: Record<string, any>) =>
      profile.id === adminProfileId);
    assert.ok(adminProfile, 'the Flow running user must have a profile');
    const profileWithAccountPermission = (permission: Record<string, boolean>) => ({
      ...originalAccessControl.data,
      profiles: originalAccessControl.data.profiles.map((profile: Record<string, any>) =>
        profile.id === adminProfileId
          ? { ...profile, objectPermissions: {
            ...profile.objectPermissions,
            Account: { ...profile.objectPermissions.Account, ...permission }
          } }
          : profile),
      permissionSets: originalAccessControl.data.permissionSets.map((permissionSet: Record<string, any>) => ({
        ...permissionSet,
        objectPermissions: {
          ...permissionSet.objectPermissions,
          ...(permissionSet.objectPermissions.Account
            ? { Account: { ...permissionSet.objectPermissions.Account, ...permission } }
            : {})
        }
      }))
    });
    const deniedRead = await send('/metadata/permissions', token, 'PUT', profileWithAccountPermission({
      read: false, create: false, edit: false, delete: false, viewAll: false, modifyAll: false
    }));
    assert.equal(deniedRead.status, 200, JSON.stringify(deniedRead.data));
    const deniedObjectRead = await send('/flows/Flow_Data_Access_Smoke/execute', token, 'POST', {});
    assert.equal(deniedObjectRead.status, 422, 'Get Records must enforce running-user object read permission');
    assert.match(String(deniedObjectRead.data.error), /does not have read access/);
    const restoredObjectRead = await send('/metadata/permissions', token, 'PUT', originalAccessControl.data);
    assert.equal(restoredObjectRead.status, 200, JSON.stringify(restoredObjectRead.data));
    const deniedFieldRead = await send('/metadata/permissions', token, 'PUT', {
      ...originalAccessControl.data,
      profiles: originalAccessControl.data.profiles.map((profile: Record<string, any>) =>
        profile.id === adminProfileId
          ? { ...profile, fieldPermissions: {
            ...profile.fieldPermissions,
            'Account.Name': { ...profile.fieldPermissions['Account.Name'], read: false, edit: false }
          } }
          : profile),
      permissionSets: originalAccessControl.data.permissionSets.map((permissionSet: Record<string, any>) => ({
        ...permissionSet,
        fieldPermissions: {
          ...permissionSet.fieldPermissions,
          'Account.Name': { ...permissionSet.fieldPermissions['Account.Name'], read: false, edit: false }
        },
        objectPermissions: {
          ...permissionSet.objectPermissions,
          ...(permissionSet.objectPermissions.Account
            ? { Account: { ...permissionSet.objectPermissions.Account, read: true, viewAll: false, modifyAll: false } }
            : {})
        }
      }))
    });
    assert.equal(deniedFieldRead.status, 200, JSON.stringify(deniedFieldRead.data));
    const deniedSelectedField = await send('/flows/Flow_Data_Access_Smoke/execute', token, 'POST', {});
    assert.equal(deniedSelectedField.status, 422, 'Get Records must enforce read access to selected fields');
    assert.match(String(deniedSelectedField.data.error), /read permission for field "Account.Name"/);
    const restoredFieldRead = await send('/metadata/permissions', token, 'PUT', originalAccessControl.data);
    assert.equal(restoredFieldRead.status, 200, JSON.stringify(restoredFieldRead.data));
    const emptyAccountQueueId = 'flow-data-access-empty-account-queue';
    const restrictedRecordAccess = await send('/metadata/permissions', token, 'PUT', {
      ...originalAccessControl.data,
      queues: [...originalAccessControl.data.queues, {
        id: emptyAccountQueueId, label: 'Flow Data Access Empty Queue', apiName: 'Flow_Data_Access_Empty_Queue',
        supportedObjectApiNames: ['Account'], userIds: [], roleIds: [], roleAndSubordinateIds: [], publicGroupIds: []
      }],
      sharingSettings: {
        ...originalAccessControl.data.sharingSettings,
        Account: { defaultAccess: 'Private', grantAccessUsingHierarchies: false }
      },
      profiles: originalAccessControl.data.profiles.map((profile: Record<string, any>) =>
        profile.id === adminProfileId
          ? { ...profile, objectPermissions: {
            ...profile.objectPermissions,
            Account: { ...profile.objectPermissions.Account, viewAll: false }
          } }
          : profile),
      permissionSets: originalAccessControl.data.permissionSets.map((permissionSet: Record<string, any>) => ({
        ...permissionSet,
        objectPermissions: {
          ...permissionSet.objectPermissions,
          ...(permissionSet.objectPermissions.Account
            ? { Account: { ...permissionSet.objectPermissions.Account, viewAll: false } }
            : {})
        }
      }))
    });
    assert.equal(restrictedRecordAccess.status, 200, JSON.stringify(restrictedRecordAccess.data));
    const transferredFlowAccessRecord = await send(
      `/records/Account/${flowAccessRecord.data.record.Id}/owner`, token, 'PUT', { ownerId: emptyAccountQueueId }
    );
    assert.equal(transferredFlowAccessRecord.status, 200, JSON.stringify(transferredFlowAccessRecord.data));
    const inaccessibleRecordRead = await send('/flows/Flow_Data_Access_Smoke/execute', token, 'POST', {});
    assert.equal(inaccessibleRecordRead.status, 200, JSON.stringify(inaccessibleRecordRead.data));
    assert.deepEqual(inaccessibleRecordRead.data.outputs.AccessibleAccounts, [],
      'Get Records must exclude records the running user cannot read under sharing rules');
    const restoredFlowAccessOwner = await send(
      `/records/Account/${flowAccessRecord.data.record.Id}/owner`, token, 'PUT', { ownerId: adminAccessUser.id }
    );
    assert.equal(restoredFlowAccessOwner.status, 200, JSON.stringify(restoredFlowAccessOwner.data));
    const restoredRecordAccess = await send('/metadata/permissions', token, 'PUT', originalAccessControl.data);
    assert.equal(restoredRecordAccess.status, 200, JSON.stringify(restoredRecordAccess.data));
    const removedFlowAccessRecord = await send(`/records/Account/${flowAccessRecord.data.record.Id}`, token, 'DELETE');
    assert.equal(removedFlowAccessRecord.status, 204, JSON.stringify(removedFlowAccessRecord.data));

    const advancedScreenFlow = await send('/metadata/flows/Screen_Advanced_Components_Smoke', token, 'PUT', {
      apiName: 'Screen_Advanced_Components_Smoke', label: 'Screen Advanced Components Smoke',
      flowType: 'Screen Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Get Records', label: 'Load Accounts', config: { object: 'Account', recordLimit: 'all', outputVariable: 'Accounts' } },
        { id: 3, type: 'Screen', label: 'Advanced Inputs', config: { fields: [
          { apiName: 'MailingAddress', label: 'Mailing Address', type: 'Address', required: true },
          { apiName: 'ContactName', label: 'Contact Name', type: 'Name', required: true },
          { apiName: 'RelatedAccount', label: 'Related Account', type: 'Lookup', objectApiName: 'Account', required: true },
          { apiName: 'ChosenAccount', label: 'Chosen Account', type: 'Data Table', collection: 'Accounts', columns: ['Name'], required: true },
          { apiName: 'Evidence', label: 'Evidence', type: 'File Upload', maxFiles: 2, maxFileSize: 512, allowedTypes: ['text/plain'], required: true },
          { apiName: 'LineItems', label: 'Line Items', type: 'Repeater', minimumRows: 1, maximumRows: 2, required: true,
            subfields: [
              { apiName: 'ItemName', label: 'Item Name', type: 'Text', required: true },
              { apiName: 'Quantity', label: 'Quantity', type: 'Number', required: true }
            ] }
        ] } }
      ],
      connectors: [
        { id: 'start-load', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'load-screen', from: 2, to: 3, label: '', kind: 'normal' }
      ],
      resources: [
        { name: 'Accounts', label: 'Accounts', type: 'Record Collection', dataType: 'Account', isCollection: true, availableForInput: false, availableForOutput: false }
      ],
      versions: []
    });
    assert.equal(advancedScreenFlow.status, 200, JSON.stringify(advancedScreenFlow.data));
    const clonedFlowDefinition = structuredClone(advancedScreenFlow.data.flow);
    clonedFlowDefinition.apiName = 'Screen_Advanced_Components_Copy';
    clonedFlowDefinition.label = 'Screen Advanced Components Copy';
    clonedFlowDefinition.status = 'Draft';
    clonedFlowDefinition.versionNumber = 1;
    clonedFlowDefinition.activeVersion = null;
    clonedFlowDefinition.versions = [];
    const clonedFlow = await send('/metadata/flows/Screen_Advanced_Components_Copy', token, 'PUT', clonedFlowDefinition);
    assert.equal(clonedFlow.status, 200, JSON.stringify(clonedFlow.data));
    assert.equal(clonedFlow.data.flow.status, 'Draft');
    assert.equal(clonedFlow.data.flow.activeVersion, null);
    assert.deepEqual(clonedFlow.data.flow.elements, advancedScreenFlow.data.flow.elements);
    assert.deepEqual(clonedFlow.data.flow.connectors, advancedScreenFlow.data.flow.connectors);
    assert.deepEqual(clonedFlow.data.flow.resources, advancedScreenFlow.data.flow.resources);
    const draftScreenRun = await send('/flows/Screen_Advanced_Components_Copy/execute', token, 'POST', {});
    assert.equal(draftScreenRun.status, 202, JSON.stringify(draftScreenRun.data));
    assert.equal(draftScreenRun.data.screen.label, 'Advanced Inputs',
      'Run executes the most recently saved Draft version, not only active versions');
    const advancedScreenRun = await send('/flows/Screen_Advanced_Components_Smoke/execute', token, 'POST', {});
    assert.equal(advancedScreenRun.status, 202, JSON.stringify(advancedScreenRun.data));
    assert.ok(Array.isArray(advancedScreenRun.data.values.Accounts) && advancedScreenRun.data.values.Accounts.length >= 4,
      'record collections used by Screen Data Tables are included in the interview state');
    const tableRecord = advancedScreenRun.data.values.Accounts[0] as Record<string, unknown>;
    const invalidScreenSubmit = await send(`/flow-interviews/${advancedScreenRun.data.interviewId}/next`, token, 'POST', {
      values: {
        MailingAddress: { street: '1 Main St', city: 'San Francisco' },
        ContactName: { firstName: 'Ada', lastName: 'Lovelace' },
        RelatedAccount: 'not-a-readable-record',
        ChosenAccount: tableRecord.Id,
        Evidence: [{ name: 'notes.txt', type: 'text/plain', size: 5, content: 'data:text/plain;base64,SGVsbG8=' }],
        LineItems: [{ ItemName: 'Widget', Quantity: 2 }]
      }
    });
    assert.equal(invalidScreenSubmit.status, 400, JSON.stringify(invalidScreenSubmit.data));
    assert.match(String(invalidScreenSubmit.data.error), /not found or is not readable/);
    const validScreenValues = {
      MailingAddress: { street: '1 Main St', city: 'San Francisco', state: 'CA', postalCode: '94105', country: 'US' },
      ContactName: { salutation: 'Ms.', firstName: 'Ada', middleName: 'M.', lastName: 'Lovelace', suffix: '' },
      RelatedAccount: tableRecord.Id,
      ChosenAccount: tableRecord.Id,
      Evidence: [{ name: 'notes.txt', type: 'text/plain', size: 5, content: 'data:text/plain;base64,SGVsbG8=' }],
      LineItems: [{ ItemName: 'Widget', Quantity: 2 }]
    };
    const completedDraftScreenRun = await send(`/flow-interviews/${draftScreenRun.data.interviewId}/next`, token, 'POST', {
      values: validScreenValues
    });
    assert.equal(completedDraftScreenRun.status, 200, JSON.stringify(completedDraftScreenRun.data));
    assert.equal(completedDraftScreenRun.data.completed, true,
      'a manually run saved Draft Screen Flow can complete its interview');
    const invalidTableSelection = await send(`/flow-interviews/${advancedScreenRun.data.interviewId}/next`, token, 'POST', {
      values: { ...validScreenValues, ChosenAccount: 'not-in-the-collection' }
    });
    assert.equal(invalidTableSelection.status, 400, JSON.stringify(invalidTableSelection.data));
    assert.match(String(invalidTableSelection.data.error), /outside its configured table/);
    const invalidUpload = await send(`/flow-interviews/${advancedScreenRun.data.interviewId}/next`, token, 'POST', {
      values: { ...validScreenValues, Evidence: [{ name: 'notes.txt', type: 'application/json', size: 5, content: 'data:application/json;base64,SGVsbG8=' }] }
    });
    assert.equal(invalidUpload.status, 400, JSON.stringify(invalidUpload.data));
    assert.match(String(invalidUpload.data.error), /invalid or disallowed file/);
    const invalidRepeater = await send(`/flow-interviews/${advancedScreenRun.data.interviewId}/next`, token, 'POST', {
      values: { ...validScreenValues, LineItems: [{ ItemName: '', Quantity: 2 }] }
    });
    assert.equal(invalidRepeater.status, 400, JSON.stringify(invalidRepeater.data));
    assert.match(String(invalidRepeater.data.error), /Repeater row field "Item Name" is required/);
    const completedScreen = await send(`/flow-interviews/${advancedScreenRun.data.interviewId}/next`, token, 'POST', {
      values: validScreenValues
    });
    assert.equal(completedScreen.status, 200, JSON.stringify(completedScreen.data));
    assert.equal(completedScreen.data.completed, true);

    const flow = {
      apiName: 'Collection_Elements_Smoke', label: 'Collection Elements Smoke', flowType: 'Autolaunched Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Get Records', label: 'Get Accounts', config: { object: 'Account', recordLimit: 'all', outputVariable: 'Accounts' } },
        { id: 3, type: 'Collection Filter', label: 'Filter Alpha Accounts', config: {
          collection: 'Accounts', outputCollection: 'AlphaAccounts', conditionLogic: '1 OR (2 AND 3)',
          conditions: [
            { field: 'Name', operator: 'Contains', value: 'Alpha' },
            { field: 'Name', operator: 'Equals', value: 'Flow Collection Beta' },
            { field: 'Name', operator: 'Equals', value: 'Flow Collection Beta' }
          ]
        } },
        { id: 4, type: 'Collection Sort', label: 'Sort Alpha Accounts', config: {
          collection: 'AlphaAccounts', outputCollection: 'SortedAccounts', sortField: 'Name', sortOrder: 'Ascending'
        } }
      ],
      connectors: [
        { id: 'start-get', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'get-filter', from: 2, to: 3, label: '', kind: 'normal' },
        { id: 'filter-sort', from: 3, to: 4, label: '', kind: 'normal' }
      ],
      resources: [
        { name: 'Accounts', label: 'Accounts', type: 'Record Collection', dataType: 'Account', isCollection: true, availableForInput: false, availableForOutput: false },
        { name: 'AlphaAccounts', label: 'Alpha Accounts', type: 'Record Collection', dataType: 'Account', isCollection: true, availableForInput: false, availableForOutput: false },
        { name: 'SortedAccounts', label: 'Sorted Accounts', type: 'Record Collection', dataType: 'Account', isCollection: true, availableForInput: false, availableForOutput: true }
      ],
      versions: []
    };
    const saved = await send('/metadata/flows/Collection_Elements_Smoke', token, 'PUT', flow);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.flow.elements[2].config.conditionLogic, '1 OR (2 AND 3)');
    const run = await send('/flows/Collection_Elements_Smoke/execute', token, 'POST', {});
    assert.equal(run.status, 200, JSON.stringify(run.data));
    assert.deepEqual(
      run.data.outputs.SortedAccounts.map((record: Record<string, unknown>) => record.Name),
      ['Flow Collection Alpha 1', 'Flow Collection Alpha 2', 'Flow Collection Beta']
    );

    const transformFlow = await send('/metadata/flows/Collection_Transform_Smoke', token, 'PUT', {
      apiName: 'Collection_Transform_Smoke', label: 'Collection Transform Smoke', flowType: 'Autolaunched Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Get Records', label: 'Get Accounts', config: { object: 'Account', recordLimit: 'all', outputVariable: 'Accounts' } },
        { id: 3, type: 'Transform', label: 'Map Account Names', config: {
          collection: 'Accounts', outputCollection: 'ContactShapes',
          mappings: [{ sourceField: 'Name', targetField: 'Name' }]
        } }
      ],
      connectors: [
        { id: 'start-get', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'get-transform', from: 2, to: 3, label: '', kind: 'normal' }
      ],
      resources: [
        { name: 'Accounts', label: 'Accounts', type: 'Record Collection', dataType: 'Account', isCollection: true, availableForInput: false, availableForOutput: false },
        { name: 'ContactShapes', label: 'Contact Shapes', type: 'Record Collection', dataType: 'Contact', isCollection: true, availableForInput: false, availableForOutput: true }
      ],
      versions: []
    });
    assert.equal(transformFlow.status, 200, JSON.stringify(transformFlow.data));
    const transformed = await send('/flows/Collection_Transform_Smoke/execute', token, 'POST', {});
    assert.equal(transformed.status, 200, JSON.stringify(transformed.data));
    assert.deepEqual(
      transformed.data.outputs.ContactShapes.map((record: Record<string, unknown>) => record.Name).sort(),
      ['Flow Collection Alpha 1', 'Flow Collection Alpha 2', 'Flow Collection Beta', 'Flow Collection Gamma']
    );
    assert.ok(transformed.data.outputs.ContactShapes.every((record: Record<string, unknown>) => !('Id' in record)),
      'Transform returns in-memory mapped records without creating stored records');

    for (const Name of ['Flow Loop Source A', 'Flow Loop Source B']) {
      const created = await send('/records/Account', token, 'POST', { Name });
      assert.equal(created.status, 201, JSON.stringify(created.data));
    }
    const loopFlowDefinition = {
      apiName: 'Loop_Collection_Smoke', label: 'Loop Collection Smoke', flowType: 'Autolaunched Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Get Records', label: 'Get Loop Sources', config: {
          object: 'Account', recordLimit: 'all', outputVariable: 'LoopSources',
          conditions: [{ field: 'Name', operator: 'Starts With', value: 'Flow Loop Source' }]
        } },
        { id: 3, type: 'Loop', label: 'Visit Sources', config: {
          collection: 'LoopSources', loopVariable: 'CurrentAccount', direction: 'Last to first'
        } },
        { id: 4, type: 'Create Records', label: 'Record Visit', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: '{CurrentAccount.Name}' }]
        } },
        { id: 5, type: 'End', label: 'End', config: {} }
      ],
      connectors: [
        { id: 'start-get-sources', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'get-loop', from: 2, to: 3, label: '', kind: 'normal' },
        { id: 'loop-each', from: 3, to: 4, label: 'For Each', kind: 'normal' },
        { id: 'record-next', from: 4, to: 3, label: '', kind: 'normal' },
        { id: 'loop-after-last', from: 3, to: 5, label: 'After Last', kind: 'normal' }
      ],
      resources: [
        { name: 'LoopSources', label: 'Loop Sources', type: 'Record Collection', dataType: 'Account', isCollection: true, availableForInput: false, availableForOutput: false },
        { name: 'CurrentAccount', label: 'Current Account', type: 'Record', dataType: 'Account', isCollection: false, availableForInput: false, availableForOutput: false }
      ],
      versions: []
    };
    const savedLoopFlow = await send('/metadata/flows/Loop_Collection_Smoke', token, 'PUT', loopFlowDefinition);
    assert.equal(savedLoopFlow.status, 200, JSON.stringify(savedLoopFlow.data));
    const loopRun = await send('/flows/Loop_Collection_Smoke/execute', token, 'POST', {});
    assert.equal(loopRun.status, 200, JSON.stringify(loopRun.data));
    const loopVisits = (await send('/records/Account', token)).data.records
      .map((record: Record<string, unknown>) => record.Name)
      .filter((name: unknown) => typeof name === 'string' && name.startsWith('Flow Loop Source'));
    assert.deepEqual(loopVisits, [
      'Flow Loop Source A', 'Flow Loop Source B', 'Flow Loop Source B', 'Flow Loop Source A'
    ], 'Loop direction and For Each/After Last paths must be honored at runtime');

    const missingLoopPath = await send('/metadata/flows/Loop_Collection_Smoke/validate', token, 'POST', {
      ...loopFlowDefinition,
      connectors: loopFlowDefinition.connectors.filter((connector) => connector.id !== 'loop-after-last')
    });
    assert.equal(missingLoopPath.status, 200, JSON.stringify(missingLoopPath.data));
    assert.ok(missingLoopPath.data.errors.some((error: string) => error.includes('exactly one For Each and one After Last')),
      JSON.stringify(missingLoopPath.data));
    const invalidLoopDirection = await send('/metadata/flows/Loop_Collection_Smoke/validate', token, 'POST', {
      ...loopFlowDefinition,
      elements: loopFlowDefinition.elements.map((element) => element.type === 'Loop'
        ? { ...element, config: { ...element.config, direction: 'Random' } }
        : element)
    });
    assert.equal(invalidLoopDirection.status, 200, JSON.stringify(invalidLoopDirection.data));
    assert.ok(invalidLoopDirection.data.errors.some((error: string) => error.includes('direction must be')),
      JSON.stringify(invalidLoopDirection.data));

    const invalidDecisionPaths = await send('/metadata/flows/Decision_Paths_Smoke/validate', token, 'POST', {
      apiName: 'Decision_Paths_Smoke', label: 'Decision Paths Smoke', flowType: 'Autolaunched Flow',
      status: 'Draft', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Decision', label: 'Choose Route', config: { outcomes: [
          { name: 'Qualified', label: 'Qualified', conditions: [{ field: 'Name', operator: 'Equals', value: 'Match' }] },
          { name: 'Default', label: 'Default Outcome', conditions: [] }
        ] } },
        { id: 3, type: 'End', label: 'Qualified End', config: {} },
        { id: 4, type: 'End', label: 'Default End', config: {} }
      ],
      connectors: [
        { id: 'start-decision', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'decision-default', from: 2, to: 4, label: 'Default Outcome', kind: 'normal' }
      ],
      resources: [], versions: []
    });
    assert.equal(invalidDecisionPaths.status, 200, JSON.stringify(invalidDecisionPaths.data));
    assert.ok(invalidDecisionPaths.data.errors.some((error: string) => error.includes('outcome "Qualified" must have exactly one connector')),
      JSON.stringify(invalidDecisionPaths.data));

    const invalidScreenPaths = await send('/metadata/flows/Screen_Paths_Smoke/validate', token, 'POST', {
      apiName: 'Screen_Paths_Smoke', label: 'Screen Paths Smoke', flowType: 'Screen Flow',
      status: 'Draft', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Screen', label: 'Choose Route', config: { fields: [], outcomes: [
          { name: 'Continue', label: 'Continue' }, { name: 'Cancel', label: 'Cancel' }
        ] } },
        { id: 3, type: 'End', label: 'Continue End', config: {} },
        { id: 4, type: 'End', label: 'Cancel End', config: {} }
      ],
      connectors: [
        { id: 'start-screen', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'screen-continue', from: 2, to: 3, label: 'Continue', kind: 'normal' }
      ],
      resources: [], versions: []
    });
    assert.equal(invalidScreenPaths.status, 200, JSON.stringify(invalidScreenPaths.data));
    assert.ok(invalidScreenPaths.data.errors.some((error: string) => error.includes('outcome "Cancel" must have exactly one connector')),
      JSON.stringify(invalidScreenPaths.data));

    const invalidFlow = {
      ...flow,
      elements: flow.elements.map((element) => element.type === 'Collection Sort'
        ? { ...element, config: { ...element.config, sortField: 'Missing_Field__c' } }
        : element)
    };
    const validation = await send('/metadata/flows/Collection_Elements_Smoke/validate', token, 'POST', invalidFlow);
    assert.equal(validation.status, 200, JSON.stringify(validation.data));
    assert.ok(validation.data.errors.some((error: string) => error.includes('Missing_Field__c')), JSON.stringify(validation.data));

    const currencySettings = await send('/metadata/currencies', token, 'PUT', {
      corporateCurrency: 'USD',
      currencies: [
        { currencyIsoCode: 'USD', conversionRate: 1 },
        { currencyIsoCode: 'EUR', conversionRate: 0.8 }
      ]
    });
    assert.equal(currencySettings.status, 200, JSON.stringify(currencySettings.data));

    const formulaFlow = await send('/metadata/flows/Formula_Functions_Smoke', token, 'PUT', {
      apiName: 'Formula_Functions_Smoke', label: 'Formula Functions Smoke', flowType: 'Autolaunched Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [{ id: 1, type: 'Start', label: 'Start', config: {} }],
      connectors: [],
      resources: [
        { name: 'NormalizedText', label: 'Normalized Text', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "LOWER(TRIM('  FLOW  '))" },
        { name: 'ShortText', label: 'Short Text', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "LEFT('MetaDrive', 4)" },
        { name: 'MiddleText', label: 'Middle Text', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "MID('MetaDrive', 5, 5)" },
        { name: 'SubstitutedText', label: 'Substituted Text', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "SUBSTITUTE('Alpha Beta Beta', 'Beta', 'Gamma')" },
        { name: 'SubstitutedInstance', label: 'Substituted Instance', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "SUBSTITUTE('Beta Beta Beta', 'Beta', 'Gamma', 2)" },
        { name: 'SubstituteMissingInstance', label: 'Substitute Missing Instance', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "SUBSTITUTE('Beta', 'Beta', 'Gamma', 2)" },
        { name: 'FoundTextPosition', label: 'Found Text Position', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "FIND('Drive', 'MetaDrive')" },
        { name: 'ConvertedNumber', label: 'Converted Number', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "VALUE('12.5')" },
        { name: 'MaximumValue', label: 'Maximum Value', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'MAX(4, 2, 8)' },
        { name: 'ContainsText', label: 'Contains Text', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "CONTAINS('MetaDrive Flow', 'Drive')" },
        { name: 'BeginsText', label: 'Begins Text', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "BEGINS('MetaDrive Flow', 'Meta')" },
        { name: 'CombinedText', label: 'Combined Text', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "CONCATENATE('Meta', 'Drive', ' Flow')" },
        { name: 'IsNumericText', label: 'Is Numeric Text', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "ISNUMBER('12.5')" },
        { name: 'Remainder', label: 'Remainder', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'MOD(17, 5)' },
        { name: 'PowerResult', label: 'Power Result', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: '2^3^2' },
        { name: 'NegativePower', label: 'Negative Power', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: '-2^2' },
        { name: 'PaddedText', label: 'Padded Text', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "LPAD('42', 5, '0')" },
        { name: 'RepeatedText', label: 'Repeated Text', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "REPT('ab', 3)" },
        { name: 'EncodedUrl', label: 'Encoded URL', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "ENCODEURL('Flow Builder')" },
        { name: 'EncodedFormUrl', label: 'Encoded URL', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "URLENCODE('Flow Builder + test')" },
        { name: 'DecodedUrl', label: 'Decoded URL', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "URLDECODE('%2FFlow%20Builder')" },
        { name: 'EncodedHtml', label: 'Encoded HTML', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "HTMLENCODE('<&>')" },
        { name: 'EncodedJavascript', label: 'Encoded JavaScript', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "JSENCODE('a&b')" },
        { name: 'HyperlinkHtml', label: 'Hyperlink HTML', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "HYPERLINK('https://example.test/a?x=1&y=2', 'A < B')" },
        { name: 'ImageHtml', label: 'Image HTML', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "IMAGE('/assets/flow.png?mode=small', 'Flow <mark>', 24, 48)" },
        { name: 'PicklistContains', label: 'Picklist Contains', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "INCLUDES('North;South', 'South')" },
        { name: 'PicklistEquals', label: 'Picklist Equals', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "ISPICKVAL('Open', 'open')" },
        { name: 'CaseSafeId', label: 'Case Safe ID', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "CASESAFEID('001A0000009z3ZI')" },
        { name: 'RoundUpValue', label: 'Round Up Value', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'ROUNDUP(-1.231, 2)' },
        { name: 'RoundDownValue', label: 'Round Down Value', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'ROUNDDOWN(-1.239, 2)' },
        { name: 'RegexMatch', label: 'Regex Match', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "REGEX('AB123', '^[A-Z]{2}[0-9]{3}$')" },
        { name: 'BooleanText', label: 'Boolean Text', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: 'TEXT(TRUE)' },
        { name: 'CaseResult', label: 'Case Result', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "CASE('Open', 'Closed', 'Stop', 'Open', 'Continue', 'Default')" },
        { name: 'TypedCaseResult', label: 'Typed CASE Result', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "CASE(1, '1', 'wrong type', 1, 'number match', 'default')" },
        { name: 'LazyCase', label: 'Lazy CASE', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "CASE('selected', 'selected', 'matched', 'unselected', 1 / 0, 1 / 0)" },
        { name: 'AsDate', label: 'As Date', type: 'Formula', dataType: 'Date', isCollection: false, availableForInput: false, availableForOutput: true, value: "DATEVALUE('2026-10-08T23:30:15Z')" },
        { name: 'AsDateTime', label: 'As Date Time', type: 'Formula', dataType: 'Date/Time', isCollection: false, availableForInput: false, availableForOutput: true, value: "DATETIMEVALUE('2026-10-08T23:30:15Z')" },
        { name: 'AsTime', label: 'As Time', type: 'Formula', dataType: 'Time', isCollection: false, availableForInput: false, availableForOutput: true, value: "TIMEVALUE('2026-10-08T23:30:15Z')" },
        { name: 'TimeValueMilliseconds', label: 'Time Value Milliseconds', type: 'Formula', dataType: 'Time', isCollection: false, availableForInput: false, availableForOutput: true, value: "TIMEVALUE('23:30:15.789')" },
        { name: 'MillisecondPart', label: 'Millisecond Part', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "MILLISECOND('2026-10-08T23:30:15.123Z')" },
        { name: 'TimeMillisecondPart', label: 'Time Millisecond Part', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "MILLISECOND('23:30:15.789')" },
        { name: 'TimezoneOffset', label: 'Timezone Offset', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "TZOFFSET('2026-10-08T12:00:00Z')" },
        { name: 'UkOffsetBeforeDst', label: 'UK Offset Before DST', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "TZOFFSET('2026-03-29T00:30:00Z')" },
        { name: 'UkOffsetAfterDst', label: 'UK Offset After DST', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "TZOFFSET('2026-03-29T01:30:00Z')" },
        { name: 'LaOffsetBeforeDst', label: 'Los Angeles Offset Before DST', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "TZOFFSET('2026-03-08T09:30:00Z')" },
        { name: 'LaOffsetAfterDst', label: 'Los Angeles Offset After DST', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "TZOFFSET('2026-03-08T10:30:00Z')" },
        { name: 'LocalDateTime', label: 'Local Date Time', type: 'Formula', dataType: 'Date/Time', isCollection: false, availableForInput: false, availableForOutput: true, value: "DATETIMEVALUE('2026-10-08 12:00:00')" },
        { name: 'LocalDateOnly', label: 'Local Date Only', type: 'Formula', dataType: 'Date', isCollection: false, availableForInput: false, availableForOutput: true, value: "DATEVALUE('2026-10-08 00:30:00')" },
        { name: 'LocalTimeOnly', label: 'Local Time Only', type: 'Formula', dataType: 'Time', isCollection: false, availableForInput: false, availableForOutput: true, value: "TIMEVALUE('2026-10-08T23:30:15')" },
        { name: 'TurkishUpper', label: 'Turkish Upper', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "UPPER('istanbul')" },
        { name: 'TurkishCase', label: 'Turkish Case', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "CASE('I', 'ı', TRUE, FALSE)" },
        { name: 'LocaleNumber', label: 'Locale Number', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: 'TEXT(1234.5)' },
        { name: 'DateParts', label: 'Date Parts', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "YEAR('2026-10-08') + MONTH('2026-10-08') + DAY('2026-10-08')" },
        { name: 'LocalYearBoundary', label: 'Local Year Boundary', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "YEAR('2026-01-01T00:30:00Z')" },
        { name: 'LocalWeekdayBoundary', label: 'Local Weekday Boundary', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "WEEKDAY('2026-10-04T00:30:00Z')" },
        { name: 'TimeParts', label: 'Time Parts', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "HOUR('23:30') + MINUTE('23:30:15') + SECOND('23:30:15')" },
        { name: 'MonthEnd', label: 'Month End', type: 'Formula', dataType: 'Date', isCollection: false, availableForInput: false, availableForOutput: true, value: "ADDMONTHS('2024-01-31', 1)" },
        { name: 'WeekdayNumber', label: 'Weekday Number', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "WEEKDAY('2026-10-04')" },
        { name: 'SundayWeekNumber', label: 'Sunday Week Number', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "WEEKNUM('2026-10-04')" },
        { name: 'MondayWeekNumber', label: 'Monday Week Number', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "WEEKNUM('2026-10-04', 2)" },
        { name: 'IsNullValue', label: 'Is Null Value', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: 'ISNULL(NULL)' },
        { name: 'NullFallback', label: 'Null Fallback', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "NULLVALUE(NULL, 'fallback')" },
        { name: 'CurrentDateTime', label: 'Current Date Time', type: 'Formula', dataType: 'Date/Time', isCollection: false, availableForInput: false, availableForOutput: true, value: 'NOW()' },
        { name: 'ValidLeapDate', label: 'Valid Leap Date', type: 'Formula', dataType: 'Date', isCollection: false, availableForInput: false, availableForOutput: true, value: 'DATE(2024, 2, 29)' },
        { name: 'DatePlusDays', label: 'Date Plus Days', type: 'Formula', dataType: 'Date', isCollection: false, availableForInput: false, availableForOutput: true, value: "ADDDAYS('2024-02-28', 1)" },
        { name: 'DateDifference', label: 'Date Difference', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "DAYS('2024-03-01', '2024-02-28')" },
        { name: 'DateArithmetic', label: 'Date Arithmetic', type: 'Formula', dataType: 'Date', isCollection: false, availableForInput: false, availableForOutput: true, value: "'2024-02-28' + 1" },
        { name: 'ConstructedTime', label: 'Constructed Time', type: 'Formula', dataType: 'Time', isCollection: false, availableForInput: false, availableForOutput: true, value: 'TIME(2, 3, 4)' },
        { name: 'RoundTiePositive', label: 'Round Tie Positive', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'ROUND(1.5)' },
        { name: 'RoundTieNegative', label: 'Round Tie Negative', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'ROUND(-1.5)' },
        { name: 'TruncatedValue', label: 'Truncated Value', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'TRUNC(-1.239, 2)' },
        { name: 'SineZero', label: 'Sine Zero', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'SIN(0)' },
        { name: 'Cotangent', label: 'Cotangent', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'COT(PI()/4)' },
        { name: 'AtanQuadrant', label: 'Atan Quadrant', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'ATAN2(1, 1)' },
        { name: 'BooleanFunctions', label: 'Boolean Functions', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: 'AND(XOR(TRUE(), FALSE()), TRUE())' },
        { name: 'ProperText', label: 'Proper Text', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: "PROPER('flow BUILDER')" },
        { name: 'LazyIf', label: 'Lazy If', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'IF(TRUE(), 10, 1/0)' },
        { name: 'ShortCircuitAnd', label: 'Short Circuit And', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: 'AND(FALSE(), 1/0)' },
        { name: 'ShortCircuitOr', label: 'Short Circuit Or', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: 'OR(TRUE(), 1/0)' },
        { name: 'DateComparison', label: 'Date Comparison', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "DATE(2024, 2, 28) < DATE(2024, 2, 29)" },
        { name: 'TextComparison', label: 'Text Comparison', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "'Beta' > 'Alpha'" },
        { name: 'CaseInsensitiveEquals', label: 'Case Insensitive Equals', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "'Alpha' = 'alpha'" },
        { name: 'ExactCaseSensitiveText', label: 'Exact Case Sensitive Text', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "EXACT('Alpha', 'alpha')" },
        { name: 'ExactIdenticalText', label: 'Exact Identical Text', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "EXACT('Alpha', 'Alpha')" },
        { name: 'BooleanNumberEquality', label: 'Boolean Number Equality', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: 'TRUE() = 1' },
        { name: 'TextNumberEquality', label: 'Text Number Equality', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: "'1' = 1" },
        { name: 'BinaryAndShortCircuit', label: 'Binary And Short Circuit', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: 'FALSE AND (1 / 0 = 1)' },
        { name: 'BinaryOrShortCircuit', label: 'Binary Or Short Circuit', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: 'TRUE OR (1 / 0 = 1)' },
        { name: 'NestedLogicalShortCircuit', label: 'Nested Logical Short Circuit', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: '(FALSE AND (1 / 0 = 1)) OR TRUE' },
        { name: 'RoundDecimalTie', label: 'Round Decimal Tie', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'ROUND(1.005, 2)' },
        { name: 'RoundNegativePrecision', label: 'Round Negative Precision', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'ROUND(125, -1)' },
        { name: 'DateYearOne', label: 'Date Year One', type: 'Formula', dataType: 'Date', isCollection: false, availableForInput: false, availableForOutput: true, value: 'DATE(1, 1, 1)' },
        { name: 'DateCenturyRollover', label: 'Date Century Rollover', type: 'Formula', dataType: 'Date', isCollection: false, availableForInput: false, availableForOutput: true, value: "ADDMONTHS('0099-12-31', 1)" },
        { name: 'BinaryAndAliasShortCircuit', label: 'Binary And Alias Short Circuit', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: 'FALSE && (1 / 0 = 1)' },
        { name: 'BinaryOrAliasShortCircuit', label: 'Binary Or Alias Short Circuit', type: 'Formula', dataType: 'Boolean', isCollection: false, availableForInput: false, availableForOutput: true, value: 'TRUE || (1 / 0 = 1)' },
        { name: 'DistanceKm', label: 'Distance Km', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "DISTANCE(GEOLOCATION(0, 0), GEOLOCATION(0, 1), 'km')" },
        { name: 'CorporateCurrencyRate', label: 'Corporate Currency Rate', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: "CURRENCYRATE('USD')" },
        { name: 'CurrentUserEmail', label: 'Current User Email', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: '$User.Email' },
        { name: 'CurrentUserCurrency', label: 'Current User Currency', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: '$User.CurrencyIsoCode' },
        { name: 'FlowCurrentDate', label: 'Flow Current Date', type: 'Formula', dataType: 'Date', isCollection: false, availableForInput: false, availableForOutput: true, value: '$Flow.CurrentDate' },
        { name: 'FlowCurrentDateTime', label: 'Flow Current Date Time', type: 'Formula', dataType: 'Date/Time', isCollection: false, availableForInput: false, availableForOutput: true, value: '$Flow.CurrentDateTime' },
        { name: 'FlowTriggeringUserId', label: 'Flow Triggering User ID', type: 'Formula', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true, value: '$Flow.TriggeringUserId' },
        { name: 'FormulaToday', label: 'Formula Today', type: 'Formula', dataType: 'Date', isCollection: false, availableForInput: false, availableForOutput: true, value: 'TODAY()' },
        { name: 'ConvertedCurrency', label: 'Converted Currency', type: 'Formula', dataType: 'Currency', isCollection: false, availableForInput: false, availableForOutput: true, value: 'CONVERTCURRENCY(10)' },
        { name: 'CeilingNegative', label: 'Ceiling Negative', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'CEILING(-1.2)' },
        { name: 'MCeilingNegative', label: 'MCEILING Negative', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'MCEILING(-1.2)' },
        { name: 'FloorNegative', label: 'Floor Negative', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'FLOOR(-1.2)' },
        { name: 'MFloorNegative', label: 'MFLOOR Negative', type: 'Formula', dataType: 'Number', isCollection: false, availableForInput: false, availableForOutput: true, value: 'MFLOOR(-1.2)' }
      ],
      versions: []
    });
    assert.equal(formulaFlow.status, 200, JSON.stringify(formulaFlow.data));
    const formulaRun = await send('/flows/Formula_Functions_Smoke/execute', token, 'POST', {});
    assert.equal(formulaRun.status, 200, JSON.stringify(formulaRun.data));
    const formulaOutputs = { ...formulaRun.data.outputs };
    assert.ok(Math.abs(formulaOutputs.Cotangent - 1) < 1e-12, 'COT(PI()/4) must evaluate to 1 within floating-point precision');
    assert.equal(formulaOutputs.FlowCurrentDate, formulaOutputs.FormulaToday,
      '$Flow.CurrentDate must use the running user\'s local calendar date');
    assert.ok(Number.isFinite(Date.parse(formulaOutputs.FlowCurrentDateTime)),
      '$Flow.CurrentDateTime must be a valid ISO date-time');
    assert.equal(formulaOutputs.FlowTriggeringUserId, login.data.user.id);
    delete formulaOutputs.Cotangent;
    delete formulaOutputs.CurrentDateTime;
    delete formulaOutputs.FlowCurrentDate;
    delete formulaOutputs.FlowCurrentDateTime;
    delete formulaOutputs.FlowTriggeringUserId;
    delete formulaOutputs.FormulaToday;
    assert.deepEqual(formulaOutputs, {
      NormalizedText: 'flow',
      ShortText: 'Meta',
      MiddleText: 'Drive',
      SubstitutedText: 'Alpha Gamma Gamma',
      SubstitutedInstance: 'Beta Gamma Beta',
      SubstituteMissingInstance: 'Beta',
      FoundTextPosition: 5,
      ConvertedNumber: 12.5,
      MaximumValue: 8,
      ContainsText: true,
      BeginsText: true,
      CombinedText: 'MetaDrive Flow',
      IsNumericText: true,
      Remainder: 2,
      ConvertedCurrency: 10,
      PowerResult: 512,
      NegativePower: -4,
      PaddedText: '00042',
      RepeatedText: 'ababab',
      EncodedUrl: 'Flow%20Builder',
      EncodedFormUrl: 'Flow%20Builder%20%2B%20test',
      DecodedUrl: '/Flow Builder',
      EncodedHtml: '&lt;&amp;&gt;',
      EncodedJavascript: 'a\\x26b',
      HyperlinkHtml: '<a href="https://example.test/a?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">A &lt; B</a>',
      ImageHtml: '<img src="/assets/flow.png?mode=small" alt="Flow &lt;mark&gt;" height="24" width="48">',
      PicklistContains: true,
      PicklistEquals: true,
      CaseSafeId: '001A0000009z3ZIIAY',
      RoundUpValue: -1.24,
      RoundDownValue: -1.23,
      RegexMatch: true,
      BooleanText: 'TRUE',
      CaseResult: 'Continue',
      TypedCaseResult: 'number match',
      LazyCase: 'matched',
      AsDate: '2026-10-08',
      AsDateTime: '2026-10-08T23:30:15.000Z',
      AsTime: '23:30:15.000',
      TimeValueMilliseconds: '23:30:15.789',
      MillisecondPart: 123,
      TimeMillisecondPart: 789,
      TimezoneOffset: 0,
      UkOffsetBeforeDst: 0,
      UkOffsetAfterDst: 0,
      LaOffsetBeforeDst: 0,
      LaOffsetAfterDst: 0,
      LocalDateTime: '2026-10-08T12:00:00.000Z',
      LocalDateOnly: '2026-10-08',
      LocalTimeOnly: '23:30:15.000',
      TurkishUpper: 'ISTANBUL',
      TurkishCase: false,
      LocaleNumber: '1234.5',
      DateParts: 2044,
      LocalYearBoundary: 2026,
      LocalWeekdayBoundary: 1,
      TimeParts: 68,
      MonthEnd: '2024-02-29',
      WeekdayNumber: 1,
      SundayWeekNumber: 41,
      MondayWeekNumber: 40,
      IsNullValue: true,
      NullFallback: 'fallback',
      ValidLeapDate: '2024-02-29',
      DatePlusDays: '2024-02-29',
      DateDifference: 2,
      DateArithmetic: '2024-02-29',
      ConstructedTime: '02:03:04.000',
      RoundTiePositive: 2,
      RoundTieNegative: -2,
      TruncatedValue: -1.23,
      SineZero: 0,
      AtanQuadrant: Math.PI / 4,
      BooleanFunctions: true,
      ProperText: 'Flow Builder',
      LazyIf: 10,
      ShortCircuitAnd: false,
      ShortCircuitOr: true,
      DateComparison: true,
      TextComparison: true,
      CaseInsensitiveEquals: true,
      ExactCaseSensitiveText: false,
      ExactIdenticalText: true,
      BooleanNumberEquality: false,
      TextNumberEquality: false,
      BinaryAndShortCircuit: false,
      BinaryOrShortCircuit: true,
      NestedLogicalShortCircuit: true,
      RoundDecimalTie: 1.01,
      RoundNegativePrecision: 130,
      DateYearOne: '0001-01-01',
      DateCenturyRollover: '0100-01-31',
      BinaryAndAliasShortCircuit: false,
      BinaryOrAliasShortCircuit: true,
      DistanceKm: 111.1950802335329,
      CorporateCurrencyRate: 1,
      CurrentUserEmail: adminEmail,
      CurrentUserCurrency: 'USD',
      ConvertedCurrency: 10,
      CeilingNegative: -1,
      MCeilingNegative: -2,
      FloorNegative: -2,
      MFloorNegative: -1
    });
    const formulaAccessControl = await send('/metadata/permissions', token);
    assert.equal(formulaAccessControl.status, 200, JSON.stringify(formulaAccessControl.data));
    const accessControlWithEuroUser = {
      ...formulaAccessControl.data,
      users: formulaAccessControl.data.users.map((user: Record<string, unknown>) =>
        user.username === adminEmail ? { ...user, currencyIsoCode: 'EUR' } : user)
    };
    const userCurrencyUpdate = await send('/metadata/permissions', token, 'PUT', accessControlWithEuroUser);
    assert.equal(userCurrencyUpdate.status, 200, JSON.stringify(userCurrencyUpdate.data));
    const convertedForEuroUser = await send('/flows/Formula_Functions_Smoke/execute', token, 'POST', {});
    assert.equal(convertedForEuroUser.status, 200, JSON.stringify(convertedForEuroUser.data));
    assert.equal(convertedForEuroUser.data.outputs.ConvertedCurrency, 12.5,
      'CONVERTCURRENCY must convert from the corporate currency to the running user currency');
    assert.equal(convertedForEuroUser.data.outputs.CurrentUserCurrency, 'EUR',
      '$User.CurrencyIsoCode must resolve using the running user rather than the corporate currency');
    const accessControlWithUsdUser = {
      ...accessControlWithEuroUser,
      users: accessControlWithEuroUser.users.map((user: Record<string, unknown>) =>
        user.username === adminEmail ? { ...user, currencyIsoCode: 'USD' } : user)
    };
    const userCurrencyReset = await send('/metadata/permissions', token, 'PUT', accessControlWithUsdUser);
    assert.equal(userCurrencyReset.status, 200, JSON.stringify(userCurrencyReset.data));
    const recordCurrencyFlow = await send('/metadata/flows/Formula_Record_Currency_Smoke', token, 'PUT', {
      apiName: 'Formula_Record_Currency_Smoke', label: 'Formula Record Currency Smoke',
      flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: 'Account',
      startConfig: {
        trigger: 'created', runWhen: 'before-save',
        entryConditions: [{ field: 'Name', operator: 'Equals', value: 'Record Currency Formula Smoke' }]
      },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Assignment', label: 'Set Converted Currency', config: {
          variable: '$Record.Phone', operator: 'Assign', value: '{ConvertedCurrencyText}'
        } }
      ],
      connectors: [{ id: 'currency-conversion-assignment', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [{
        name: 'ConvertedCurrencyText', label: 'Converted Currency Text', type: 'Formula', dataType: 'Text',
        isCollection: false, availableForInput: false, availableForOutput: false,
        value: 'TEXT(CONVERTCURRENCY($Record.AnnualRevenue))'
      }],
      versions: []
    });
    assert.equal(recordCurrencyFlow.status, 200, JSON.stringify(recordCurrencyFlow.data));
    const recordCurrencyCreated = await send('/records/Account', token, 'POST', {
      Name: 'Record Currency Formula Smoke',
      AnnualRevenue: 10,
      CurrencyIsoCode: 'EUR'
    });
    assert.equal(recordCurrencyCreated.status, 201, JSON.stringify(recordCurrencyCreated.data));
    assert.equal(recordCurrencyCreated.data.record.CurrencyIsoCode, 'EUR');
    assert.equal(recordCurrencyCreated.data.record.Phone, '8',
      'CONVERTCURRENCY must convert a record-currency amount into the running user currency');
    const deactivateRecordCurrency = await send('/metadata/currencies', token, 'PUT', {
      corporateCurrency: 'USD',
      currencies: [{ currencyIsoCode: 'USD', conversionRate: 1 }]
    });
    assert.equal(deactivateRecordCurrency.status, 409, JSON.stringify(deactivateRecordCurrency.data));
    const restoreEuroUserCurrency = await send('/metadata/permissions', token, 'PUT', accessControlWithEuroUser);
    assert.equal(restoreEuroUserCurrency.status, 200, JSON.stringify(restoreEuroUserCurrency.data));
    const inactiveUserCurrency = await send('/metadata/permissions', token, 'PUT', {
      ...accessControlWithEuroUser,
      users: accessControlWithEuroUser.users.map((user: Record<string, unknown>) =>
        user.username === adminEmail ? { ...user, currencyIsoCode: 'GBP' } : user)
    });
    assert.equal(inactiveUserCurrency.status, 400, JSON.stringify(inactiveUserCurrency.data));
    const deactivateAssignedCurrency = await send('/metadata/currencies', token, 'PUT', {
      corporateCurrency: 'USD',
      currencies: [{ currencyIsoCode: 'USD', conversionRate: 1 }]
    });
    assert.equal(deactivateAssignedCurrency.status, 409, JSON.stringify(deactivateAssignedCurrency.data));
    assert.ok(Number.isFinite(Date.parse(formulaRun.data.outputs.CurrentDateTime)),
      'NOW must return a valid ISO date-time value');
    const accessControl = await send('/metadata/permissions', token);
    assert.equal(accessControl.status, 200, JSON.stringify(accessControl.data));
    const originalAdminSettings = accessControl.data.users.find((user: Record<string, unknown>) =>
      user.username === adminEmail);
    assert.ok(originalAdminSettings, 'the administrator must be available for timezone formula tests');
    try {
      const londonSettings = {
        ...accessControl.data,
        users: accessControl.data.users.map((user: Record<string, unknown>) => user.id === originalAdminSettings.id
          ? { ...user, timeZone: 'Europe/London', locale: 'tr-TR' }
          : user)
      };
      const updatedSettings = await send('/metadata/permissions', token, 'PUT', londonSettings);
      assert.equal(updatedSettings.status, 200, JSON.stringify(updatedSettings.data));
      const londonRun = await send('/flows/Formula_Functions_Smoke/execute', token, 'POST', {});
      assert.equal(londonRun.status, 200, JSON.stringify(londonRun.data));
      assert.equal(londonRun.data.outputs.AsDate, '2026-10-09');
      assert.equal(londonRun.data.outputs.AsTime, '00:30:15.000');
      assert.equal(londonRun.data.outputs.LocalDateTime, '2026-10-08T11:00:00.000Z');
      assert.equal(londonRun.data.outputs.LocalDateOnly, '2026-10-08');
      assert.equal(londonRun.data.outputs.LocalTimeOnly, '23:30:15.000');
      assert.equal(londonRun.data.outputs.FlowCurrentDate, londonRun.data.outputs.FormulaToday,
        '$Flow.CurrentDate must follow the running user time zone');
      assert.equal(londonRun.data.outputs.TurkishUpper, 'İSTANBUL');
      assert.equal(londonRun.data.outputs.TurkishCase, true);
      assert.equal(londonRun.data.outputs.LocaleNumber, '1234,5');
      assert.equal(londonRun.data.outputs.TimezoneOffset, 3_600_000);
      assert.equal(londonRun.data.outputs.UkOffsetBeforeDst, 0);
      assert.equal(londonRun.data.outputs.UkOffsetAfterDst, 3_600_000);
      const currencySettings = await send('/metadata/currencies', token);
      assert.equal(currencySettings.status, 200, JSON.stringify(currencySettings.data));
      assert.equal(currencySettings.data.corporateCurrency, 'USD');
      const savedCurrencySettings = await send('/metadata/currencies', token, 'PUT', {
        corporateCurrency: 'USD',
        currencies: [
          { currencyIsoCode: 'USD', conversionRate: 1 },
          { currencyIsoCode: 'EUR', conversionRate: 0.92 }
        ]
      });
      assert.equal(savedCurrencySettings.status, 200, JSON.stringify(savedCurrencySettings.data));
      const localizedValueFlow = await send('/metadata/flows/Localized_Value_Smoke', token, 'PUT', {
        apiName: 'Localized_Value_Smoke',
        label: 'Localized Value Smoke',
        flowType: 'Autolaunched Flow',
        status: 'Active',
        versionNumber: 1,
        activeVersion: null,
        triggerObject: null,
        startConfig: {},
        elements: [{ id: 1, type: 'Start', label: 'Start', config: {} }],
        connectors: [],
        resources: [{
          name: 'LocalizedInput',
          label: 'Localized Input',
          type: 'Formula',
          dataType: 'Number',
          isCollection: false,
          availableForInput: false,
          availableForOutput: true,
          value: "VALUE('1.234,5')"
        }, {
          name: 'EuroRate',
          label: 'Euro Rate',
          type: 'Formula',
          dataType: 'Number',
          isCollection: false,
          availableForInput: false,
          availableForOutput: true,
          value: "CURRENCYRATE('eur')"
        }, {
          name: 'LocalizedIsNumber',
          label: 'Localized Is Number',
          type: 'Formula',
          dataType: 'Boolean',
          isCollection: false,
          availableForInput: false,
          availableForOutput: true,
          value: "ISNUMBER('1.234,5')"
        }, {
          name: 'WrongLocaleIsNumber',
          label: 'Wrong Locale Is Number',
          type: 'Formula',
          dataType: 'Boolean',
          isCollection: false,
          availableForInput: false,
          availableForOutput: true,
          value: "ISNUMBER('1,234.5')"
        }],
        versions: []
      });
      assert.equal(localizedValueFlow.status, 200, JSON.stringify(localizedValueFlow.data));
      const localizedValueRun = await send('/flows/Localized_Value_Smoke/execute', token, 'POST', {});
      assert.equal(localizedValueRun.status, 200, JSON.stringify(localizedValueRun.data));
      assert.equal(localizedValueRun.data.outputs.LocalizedInput, 1234.5);
      assert.equal(localizedValueRun.data.outputs.EuroRate, 0.92);
      assert.equal(localizedValueRun.data.outputs.LocalizedIsNumber, true);
      assert.equal(localizedValueRun.data.outputs.WrongLocaleIsNumber, false);
      const localizedDebug = await send('/flows/Localized_Value_Smoke/debug', token, 'POST', {});
      assert.equal(localizedDebug.status, 200, JSON.stringify(localizedDebug.data));
      assert.equal(localizedDebug.data.outputs.LocalizedInput, 1234.5);
      assert.equal(localizedDebug.data.sideEffectsSimulated, true);
      assert.ok(Array.isArray(localizedDebug.data.debugTrace) && localizedDebug.data.debugTrace.length > 0,
        'debug must return the executed element trace');
      const invalidDebugInput = await send('/flows/Localized_Value_Smoke/debug', token, 'POST', { Unknown: 'value' });
      assert.equal(invalidDebugInput.status, 400, 'debug must reject resources that are not available for input');
      const debugTriggeredFlow = await send('/metadata/flows/Debug_Triggered_Notification_Smoke', token, 'PUT', {
        apiName: 'Debug_Triggered_Notification_Smoke', label: 'Debug Triggered Notification Smoke',
        flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
        triggerObject: 'Account',
        startConfig: {
          trigger: 'created', runWhen: 'after-save', conditionLogic: 'All',
          entryConditions: [{ field: 'Name', operator: 'Equals', value: 'Debug Must Not Persist' }]
        },
        elements: [
          { id: 1, type: 'Start', label: 'Start', config: {} },
          { id: 2, type: 'Action', label: 'Debug Notification', config: {
            actionType: 'Custom Notification', recipientIds: '{!$User.Id}',
            title: 'Debug notification', messageBody: 'Must not persist'
          } }
        ],
        connectors: [{ id: 'start-notification', from: 1, to: 2, label: '', kind: 'normal' }],
        resources: [], versions: []
      });
      assert.equal(debugTriggeredFlow.status, 200, JSON.stringify(debugTriggeredFlow.data));
      const debugCreateFlow = await send('/metadata/flows/Debug_Create_Record_Smoke', token, 'PUT', {
        apiName: 'Debug_Create_Record_Smoke', label: 'Debug Create Record Smoke',
        flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1, activeVersion: null,
        triggerObject: null, startConfig: {},
        elements: [
          { id: 1, type: 'Start', label: 'Start', config: {} },
          { id: 2, type: 'Create Records', label: 'Create Debug Account', config: {
            object: 'Account', fieldValues: [{ field: 'Name', value: 'Debug Must Not Persist' }]
          } }
        ],
        connectors: [{ id: 'start-create', from: 1, to: 2, label: '', kind: 'normal' }],
        resources: [], versions: []
      });
      assert.equal(debugCreateFlow.status, 200, JSON.stringify(debugCreateFlow.data));
      const recordsBeforeDebug = (await send('/records/Account', token)).data.records.length as number;
      const notificationsBeforeDebug = (await send('/notifications', token)).data.notifications.length as number;
      const nestedDebug = await send('/flows/Debug_Create_Record_Smoke/debug', token, 'POST', {});
      assert.equal(nestedDebug.status, 200, JSON.stringify(nestedDebug.data));
      assert.ok(nestedDebug.data.debugTrace.some((entry: Record<string, unknown>) =>
        entry.flowApiName === 'Debug_Triggered_Notification_Smoke'),
      'debug must propagate into record-triggered flows and include their trace');
      assert.equal((await send('/records/Account', token)).data.records.length, recordsBeforeDebug,
        'debugged Create Records must not persist');
      assert.equal((await send('/notifications', token)).data.notifications.length, notificationsBeforeDebug,
        'side effects from nested record-triggered flows must not persist during debug');
      const invalidCurrencySettings = await send('/metadata/currencies', token, 'PUT', {
        corporateCurrency: 'EUR',
        currencies: [
          { currencyIsoCode: 'USD', conversionRate: 1 },
          { currencyIsoCode: 'EUR', conversionRate: 0.92 }
        ]
      });
      assert.equal(invalidCurrencySettings.status, 400);
      const inactiveCurrencyFlow = await send('/metadata/flows/Inactive_Currency_Rate_Smoke', token, 'PUT', {
        ...localizedValueFlow.data.flow,
        apiName: 'Inactive_Currency_Rate_Smoke',
        label: 'Inactive Currency Rate Smoke',
        resources: [{
          name: 'InactiveRate',
          label: 'Inactive Rate',
          type: 'Formula',
          dataType: 'Number',
          isCollection: false,
          availableForInput: false,
          availableForOutput: true,
          value: "CURRENCYRATE('GBP')"
        }]
      });
      assert.equal(inactiveCurrencyFlow.status, 422);
      assert.ok(inactiveCurrencyFlow.data.details.some((error: string) => error.includes('is not active')),
        JSON.stringify(inactiveCurrencyFlow.data));

      const timezoneObject = await send('/metadata/objects', token, 'POST', {
        apiName: 'Formula_Timezone_Smoke__c',
        label: 'Formula Timezone Smoke',
        pluralLabel: 'Formula Timezone Smokes',
        kind: 'Custom Object',
        description: 'Formula locale and time zone coverage',
        fields: [{ apiName: 'Name', label: 'Name', dataType: 'Text(80)', required: true, unique: false }],
        settings: {
          allowReports: true,
          allowActivities: true,
          trackFieldHistory: false,
          allowInChatter: false,
          deploymentStatus: 'Deployed',
          recordNameType: 'Text',
          recordNameFormat: ''
        }
      });
      assert.equal(timezoneObject.status, 201, JSON.stringify(timezoneObject.data));
      const dateFormula = await send('/metadata/objects/Formula_Timezone_Smoke__c/fields', token, 'POST', {
        apiName: 'Local_Date__c',
        label: 'Local Date',
        dataType: 'Formula(Date)',
        required: false,
        unique: false,
        formula: { expression: "DATEVALUE('2026-10-08T23:30:15Z')", returnType: 'Date' }
      });
      assert.equal(dateFormula.status, 201, JSON.stringify(dateFormula.data));
      const localeFormula = await send('/metadata/objects/Formula_Timezone_Smoke__c/fields', token, 'POST', {
        apiName: 'Localized_Number__c',
        label: 'Localized Number',
        dataType: 'Formula(Text)',
        required: false,
        unique: false,
        formula: { expression: 'TEXT(1234.5)', returnType: 'Text' }
      });
      assert.equal(localeFormula.status, 201, JSON.stringify(localeFormula.data));
      const currencyFormula = await send('/metadata/objects/Formula_Timezone_Smoke__c/fields', token, 'POST', {
        apiName: 'Euro_Rate__c',
        label: 'Euro Rate',
        dataType: 'Formula(Number)',
        required: false,
        unique: false,
        formula: { expression: "CURRENCYRATE('EUR')", returnType: 'Number' }
      });
      assert.equal(currencyFormula.status, 201, JSON.stringify(currencyFormula.data));
      const userFormula = await send('/metadata/objects/Formula_Timezone_Smoke__c/fields', token, 'POST', {
        apiName: 'Running_User_Email__c',
        label: 'Running User Email',
        dataType: 'Formula(Text)',
        required: false,
        unique: false,
        formula: { expression: '$User.Email', returnType: 'Text' }
      });
      assert.equal(userFormula.status, 201, JSON.stringify(userFormula.data));
      const timezoneRecord = await send('/records/Formula_Timezone_Smoke__c', token, 'POST', { Name: 'Context Check' });
      assert.equal(timezoneRecord.status, 201, JSON.stringify(timezoneRecord.data));
      assert.equal(timezoneRecord.data.record.Local_Date__c, '2026-10-09');
      assert.equal(timezoneRecord.data.record.Localized_Number__c, '1234,5');
      assert.equal(timezoneRecord.data.record.Running_User_Email__c, adminEmail);
      assert.equal(timezoneRecord.data.record.Euro_Rate__c, 0.92);

      const losAngelesSettings = {
        ...londonSettings,
        users: londonSettings.users.map((user: Record<string, unknown>) => user.id === originalAdminSettings.id
          ? { ...user, timeZone: 'America/Los_Angeles' }
          : user)
      };
      const updatedLosAngelesSettings = await send('/metadata/permissions', token, 'PUT', losAngelesSettings);
      assert.equal(updatedLosAngelesSettings.status, 200, JSON.stringify(updatedLosAngelesSettings.data));
      const losAngelesRun = await send('/flows/Formula_Functions_Smoke/execute', token, 'POST', {});
      assert.equal(losAngelesRun.status, 200, JSON.stringify(losAngelesRun.data));
      assert.equal(losAngelesRun.data.outputs.LocalDateTime, '2026-10-08T19:00:00.000Z');
      assert.equal(losAngelesRun.data.outputs.LocalDateOnly, '2026-10-08');
      assert.equal(losAngelesRun.data.outputs.LocalYearBoundary, 2025);
      assert.equal(losAngelesRun.data.outputs.LocalWeekdayBoundary, 7);
      assert.equal(losAngelesRun.data.outputs.TimezoneOffset, -25_200_000);
      assert.equal(losAngelesRun.data.outputs.LaOffsetBeforeDst, -28_800_000);
      assert.equal(losAngelesRun.data.outputs.LaOffsetAfterDst, -25_200_000);
      const dstGapFlow = await send('/metadata/flows/Formula_Functions_Smoke', token, 'PUT', {
        ...formulaFlow.data.flow,
        resources: formulaFlow.data.flow.resources.map((resource: Record<string, unknown>) =>
          resource.name === 'LocalDateTime'
            ? { ...resource, value: "DATETIMEVALUE('2026-03-08 02:30:00')" }
            : resource)
      });
      assert.equal(dstGapFlow.status, 422, JSON.stringify(dstGapFlow.data));
      assert.ok(dstGapFlow.data.details.some((error: string) => /daylight-saving transition/i.test(error)),
        'activation must reject local formula times inside a daylight-saving gap');
    } finally {
      const restoredSettings = await send('/metadata/permissions', token, 'PUT', accessControl.data);
      assert.equal(restoredSettings.status, 200, JSON.stringify(restoredSettings.data));
    }
    const invalidDateFormula = await send('/metadata/flows/Formula_Functions_Smoke/validate', token, 'POST', {
      ...formulaFlow.data.flow,
      status: 'Draft',
      resources: formulaFlow.data.flow.resources.map((resource: Record<string, unknown>) =>
        resource.name === 'ValidLeapDate' ? { ...resource, value: 'DATE(2026, 2, 29)' } : resource)
    });
    assert.ok(invalidDateFormula.data.errors.some((error: string) => error.includes('invalid date')),
      'formula DATE must reject invalid calendar dates rather than normalize them');
    const invalidFormulaCases = [
      { expression: 'AND(TRUE())', message: 'between 2 and 255 arguments' },
      { expression: 'TIME(24, 0, 0)', message: 'valid hour, minute, and second' },
      { expression: 'COT(0)', message: 'undefined' },
      { expression: 'ROUND(1, 16)', message: 'precision must be an integer' },
      { expression: 'IF(1, 2, 3)', message: 'Boolean values' },
      { expression: 'TRUE() < 2', message: 'compatible numbers, text, or dates' },
      { expression: "LEN('x', 'y')", message: 'LEN requires exactly 1 argument' },
      { expression: "SUBSTITUTE('one one', 'one', 'two', 0)", message: 'positive integer' },
      { expression: "REPT('abcd', 25001)", message: '100,000-character limit' },
      { expression: 'POWER(10, 400)', message: 'finite number' },
      { expression: 'GEOLOCATION(91, 0)', message: 'latitude must be between -90 and 90' },
      { expression: "DISTANCE(GEOLOCATION(0, 0), GEOLOCATION(0, 1), 'm')", message: 'unit must be "mi" or "km"' },
      { expression: "DISTANCE(1, GEOLOCATION(0, 1), 'km')", message: 'must be a GEOLOCATION value' },
      { expression: "DATETIMEVALUE('2026-10-08T12:00:00+14:30')", message: 'offset no greater than 14:00' },
      { expression: "CASESAFEID('001A0000009z3ZIAA0')", message: 'invalid 18-character' },
      { expression: "HYPERLINK('javascript:alert(1)', 'open')", message: 'supports only HTTP(S) URLs' },
      { expression: "IMAGE('https://example.test/image.png', 'alt', 0)", message: 'integers from 1 through 10000' },
      { expression: 'VALUE()', message: 'VALUE requires exactly 1 argument' },
      { expression: "ADDDAYS('0001-01-01', -1)", message: 'outside the supported range' },
      { expression: 'IF(TRUE(), 1, IF(FALSE(), 2, 3)', message: 'missing a closing parenthesis' },
      { expression: `${'1+'.repeat(1001)}1`, message: '2,000-token limit' }
    ];
    for (const [index, invalidCase] of invalidFormulaCases.entries()) {
      const invalidFormula = await send('/metadata/flows/Formula_Functions_Smoke/validate', token, 'POST', {
        ...formulaFlow.data.flow,
        status: 'Draft',
        resources: formulaFlow.data.flow.resources.map((resource: Record<string, unknown>) =>
          resource.name === 'ValidLeapDate' ? { ...resource, dataType: 'Number', value: invalidCase.expression } : resource)
      });
      assert.ok(invalidFormula.data.errors.some((error: string) => error.toLowerCase().includes(invalidCase.message.toLowerCase())),
        `formula validation case ${index + 1} must reject ${invalidCase.expression}: ${JSON.stringify(invalidFormula.data.errors)}`);
    }

    const decisionFlow = await send('/metadata/flows/Decision_Resource_Smoke', token, 'PUT', {
      apiName: 'Decision_Resource_Smoke', label: 'Decision Resource Smoke', flowType: 'Autolaunched Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Decision', label: 'Route by Region', config: { outcomes: [
          { name: 'Starts_E', label: 'Starts E', conditionLogic: 'All', conditions: [{ field: '{Region}', operator: 'Starts With', value: 'E' }] },
          { name: 'Custom_Logic', label: 'Custom Logic', conditionLogic: '1 OR (2 AND 3)', conditions: [
            { field: '{Region}', operator: 'Starts With', value: 'W' },
            { field: '{Region}', operator: 'Equals', value: 'North' },
            { field: '{Region}', operator: 'Is Not Null', value: '' }
          ] },
          { name: 'Has_Region', label: 'Has Region', conditionLogic: 'All', conditions: [{ field: '{Region}', operator: 'Is Not Null', value: '' }] },
          { name: 'Default', label: 'Default Outcome', conditions: [] }
        ] } },
        { id: 3, type: 'Assignment', label: 'Set Starts With Result', config: { variable: 'Result', operator: 'Assign', value: 'Starts E' } },
        { id: 4, type: 'Assignment', label: 'Set Existing Result', config: { variable: 'Result', operator: 'Assign', value: 'Has Region' } },
        { id: 5, type: 'Assignment', label: 'Set Default Result', config: { variable: 'Result', operator: 'Assign', value: 'Fallback' } },
        { id: 6, type: 'Assignment', label: 'Set Custom Logic Result', config: { variable: 'Result', operator: 'Assign', value: 'Custom Logic' } }
      ],
      connectors: [
        { id: 'start-decision', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'starts-e', from: 2, to: 3, label: 'Starts E', kind: 'normal' },
        { id: 'custom-logic', from: 2, to: 6, label: 'Custom Logic', kind: 'normal' },
        { id: 'has-region', from: 2, to: 4, label: 'Has Region', kind: 'normal' },
        { id: 'default', from: 2, to: 5, label: 'Default Outcome', kind: 'normal' }
      ],
      resources: [
        { name: 'Region', label: 'Region', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: true, availableForOutput: false },
        { name: 'Amount', label: 'Amount', type: 'Variable', dataType: 'Number', isCollection: false, availableForInput: true, availableForOutput: true },
        { name: 'Enabled', label: 'Enabled', type: 'Variable', dataType: 'Boolean', isCollection: false, availableForInput: true, availableForOutput: true },
        { name: 'EffectiveDate', label: 'Effective Date', type: 'Variable', dataType: 'Date', isCollection: false, availableForInput: true, availableForOutput: true },
        { name: 'MeetingAt', label: 'Meeting At', type: 'Variable', dataType: 'Date/Time', isCollection: false, availableForInput: true, availableForOutput: true },
        { name: 'StartTime', label: 'Start Time', type: 'Variable', dataType: 'Time', isCollection: false, availableForInput: true, availableForOutput: true },
        { name: 'Topics', label: 'Topics', type: 'Variable', dataType: 'Multi-Select Picklist', isCollection: false, availableForInput: true, availableForOutput: true },
        { name: 'Result', label: 'Result', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true }
      ],
      versions: []
    });
    assert.equal(decisionFlow.status, 200, JSON.stringify(decisionFlow.data));
    for (const [region, expected] of [['East Coast', 'Starts E'], ['West Coast', 'Custom Logic'], ['', 'Fallback']]) {
      const result = await send('/flows/Decision_Resource_Smoke/execute', token, 'POST', { Region: region });
      assert.equal(result.status, 200, JSON.stringify(result.data));
      assert.equal(result.data.outputs.Result, expected);
    }
    const debugDecision = await send('/flows/Decision_Resource_Smoke/debug', token, 'POST', { Region: 'West Coast' });
    assert.equal(debugDecision.status, 200, JSON.stringify(debugDecision.data));
    assert.equal(debugDecision.data.outputs.Result, 'Custom Logic');
    assert.ok(debugDecision.data.debugTrace.some((entry: Record<string, unknown>) => entry.label === 'Set Custom Logic Result'),
      'debug trace must follow the selected decision outcome');
    const typedFlowInputs = {
      Amount: 12.5, Enabled: true, EffectiveDate: '2026-10-09',
      MeetingAt: '2026-10-09T07:00:00.000Z', StartTime: '09:30', Topics: ['Sales', 'Service']
    };
    const typedFlowRun = await send('/flows/Decision_Resource_Smoke/execute', token, 'POST', {
      ...typedFlowInputs, Region: 'East'
    });
    assert.equal(typedFlowRun.status, 200, JSON.stringify(typedFlowRun.data));
    assert.equal(typedFlowRun.data.outputs.Amount, typedFlowInputs.Amount);
    assert.equal(typedFlowRun.data.outputs.Enabled, typedFlowInputs.Enabled);
    assert.equal(typedFlowRun.data.outputs.EffectiveDate, typedFlowInputs.EffectiveDate);
    assert.equal(typedFlowRun.data.outputs.MeetingAt, typedFlowInputs.MeetingAt);
    assert.equal(typedFlowRun.data.outputs.StartTime, typedFlowInputs.StartTime);
    assert.deepEqual(typedFlowRun.data.outputs.Topics, typedFlowInputs.Topics);
    const invalidNumberInput = await send('/flows/Decision_Resource_Smoke/execute', token, 'POST', { Amount: '12.5' });
    assert.equal(invalidNumberInput.status, 400, 'number inputs must reject string values');
    const invalidDateInput = await send('/flows/Decision_Resource_Smoke/debug', token, 'POST', { EffectiveDate: '2026-02-29' });
    assert.equal(invalidDateInput.status, 400, 'date inputs must reject invalid calendar dates');
    const invalidTimeInput = await send('/flows/Decision_Resource_Smoke/debug', token, 'POST', { StartTime: '24:30' });
    assert.equal(invalidTimeInput.status, 400, 'time inputs must reject invalid clock values');
    const invalidMultiSelectInput = await send('/flows/Decision_Resource_Smoke/execute', token, 'POST', { Topics: 'Sales,Service' });
    assert.equal(invalidMultiSelectInput.status, 400, 'multi-select inputs must be arrays of text values');
    const unsupportedInputType = await send('/metadata/flows/Decision_Resource_Smoke/validate', token, 'POST', {
      ...decisionFlow.data.flow,
      status: 'Draft',
      resources: decisionFlow.data.flow.resources.map((resource: Record<string, unknown>) =>
        resource.name === 'Region' ? { ...resource, dataType: 'Unsupported Type' } : resource)
    });
    assert.ok(unsupportedInputType.data.errors.some((error: string) => error.includes('uses unsupported data type')),
      JSON.stringify(unsupportedInputType.data));
    const scheduledRecord = await send('/records/Account', token, 'POST', { Name: 'Timezone Schedule Pending' });
    assert.equal(scheduledRecord.status, 201, JSON.stringify(scheduledRecord.data));
    const scheduleTimeZone = 'Asia/Tokyo';
    const localParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: scheduleTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const localStart = new Date(Date.UTC(
      Number(localParts.year), Number(localParts.month) - 1, Number(localParts.day),
      Number(localParts.hour), Number(localParts.minute) - 10
    ));
    const scheduledFlow = await send('/metadata/flows/Timezone_Schedule_Smoke', token, 'PUT', {
      apiName: 'Timezone_Schedule_Smoke', label: 'Timezone Schedule Smoke',
      flowType: 'Schedule-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: 'Account',
      startConfig: {
        startDate: localStart.toISOString().slice(0, 10),
        startTime: localStart.toISOString().slice(11, 16),
        timeZone: scheduleTimeZone,
        frequency: 'Once',
        entryConditions: [{ field: 'Name', operator: 'Equals', value: 'Timezone Schedule Pending' }]
      },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Update Records', label: 'Mark Scheduled Run', config: {
          object: 'Account', conditionLogic: 'All',
          conditions: [{ field: 'Name', operator: 'Equals', value: 'Timezone Schedule Pending' }],
          fieldValues: [{ field: 'Name', value: 'Timezone Schedule Executed' }]
        } }
      ],
      connectors: [{ id: 'schedule-update', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(scheduledFlow.status, 200, JSON.stringify(scheduledFlow.data));
    let scheduleDispatched = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const records = await send('/records/Account', token);
      scheduleDispatched = records.data.records.some((record: Record<string, unknown>) => record.Name === 'Timezone Schedule Executed');
      if (scheduleDispatched) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(scheduleDispatched, 'scheduled Flows must dispatch at the configured IANA local time, not interpret it as UTC');
    const scheduledPathFlow = await send('/metadata/flows/Record_Scheduled_Path_Smoke', token, 'PUT', {
      apiName: 'Record_Scheduled_Path_Smoke', label: 'Record Scheduled Path Smoke',
      flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: 'Account',
      startConfig: { trigger: 'created', runWhen: 'after-save', entryConditions: [] },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Update Records', label: 'Update after scheduled path', config: {
          object: 'Account', conditions: [],
          fieldValues: [{ field: 'Name', value: 'Scheduled Path Executed' }]
        } }
      ],
      connectors: [{
        id: 'start-scheduled-update', from: 1, to: 2, label: 'Follow up',
        kind: 'scheduled',
        scheduledPath: { timeSourceFieldApiName: 'Scheduled_Path_At__c', offsetAmount: -1, offsetUnit: 'Minutes' }
      }],
      resources: [], versions: []
    });
    assert.equal(scheduledPathFlow.status, 200, JSON.stringify(scheduledPathFlow.data));
    const scheduledPathRecord = await send('/records/Account', token, 'POST', {
      Name: 'Scheduled Path Pending',
      Scheduled_Path_At__c: new Date(Date.now() + 30_000).toISOString()
    });
    assert.equal(scheduledPathRecord.status, 201, JSON.stringify(scheduledPathRecord.data));
    let scheduledPathDispatched = false;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const records = await send('/records/Account', token);
      scheduledPathDispatched = records.data.records.some((record: Record<string, unknown>) => record.Name === 'Scheduled Path Executed');
      if (scheduledPathDispatched) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(scheduledPathDispatched, 'record-triggered scheduled paths must resume through their configured connector after the time-source offset');
    const waitTimeZone = 'America/Los_Angeles';
    const waitLocalParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: waitTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(Date.now() + 10 * 60_000)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    const waitLocalDateTime = `${waitLocalParts.year}-${waitLocalParts.month}-${waitLocalParts.day}T${waitLocalParts.hour}:${waitLocalParts.minute}`;
    const waitFlow = await send('/metadata/flows/Wait_Timezone_Smoke', token, 'PUT', {
      apiName: 'Wait_Timezone_Smoke', label: 'Wait Timezone Smoke', flowType: 'Autolaunched Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Wait', label: 'Wait Until Local Time', config: {
          waitType: 'Specific Time', dateTime: waitLocalDateTime, timeZone: waitTimeZone
        } }
      ],
      connectors: [{ id: 'start-wait', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(waitFlow.status, 200, JSON.stringify(waitFlow.data));
    const startedWait = await send('/flows/Wait_Timezone_Smoke/execute', token, 'POST', {});
    assert.equal(startedWait.status, 202, JSON.stringify(startedWait.data));
    const resumedLocalParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: waitTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date(startedWait.data.waitUntil)).filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    assert.equal(
      `${resumedLocalParts.year}-${resumedLocalParts.month}-${resumedLocalParts.day}T${resumedLocalParts.hour}:${resumedLocalParts.minute}`,
      waitLocalDateTime,
      'Wait specific times must resolve using their configured IANA time zone'
    );
    const invalidWaitTimeZone = await send('/metadata/flows/Wait_Timezone_Smoke/validate', token, 'POST', {
      ...waitFlow.data.flow,
      status: 'Draft',
      elements: waitFlow.data.flow.elements.map((element: Record<string, any>) => element.type === 'Wait'
        ? { ...element, config: { ...element.config, timeZone: 'Invalid/Time_Zone' } }
        : element)
    });
    assert.ok(invalidWaitTimeZone.data.errors.some((error: string) => error.includes('valid IANA time zone')),
      JSON.stringify(invalidWaitTimeZone.data));
    const nonexistentWaitTime = await send('/metadata/flows/Wait_Timezone_Smoke/validate', token, 'POST', {
      ...waitFlow.data.flow,
      status: 'Draft',
      elements: waitFlow.data.flow.elements.map((element: Record<string, any>) => element.type === 'Wait'
        ? { ...element, config: { ...element.config, dateTime: '2026-03-08T02:30', timeZone: 'America/New_York' } }
        : element)
    });
    assert.ok(nonexistentWaitTime.data.errors.some((error: string) => error.includes('valid local resume date and time')),
      JSON.stringify(nonexistentWaitTime.data));
    for (const [startConfig, expectedError] of [
      [{ startDate: '2026-10-08', startTime: '12:00', timeZone: 'Invalid/Time_Zone', frequency: 'Once' }, 'valid IANA time zone'],
      [{ startDate: '2026-03-08', startTime: '02:30', timeZone: 'America/New_York', frequency: 'Once' }, 'daylight-saving transition']
    ]) {
      const validation = await send('/metadata/flows/Timezone_Schedule_Smoke/validate', token, 'POST', {
        ...scheduledFlow.data.flow,
        status: 'Draft',
        startConfig
      });
      assert.equal(validation.status, 200, JSON.stringify(validation.data));
      assert.ok(validation.data.errors.some((error: string) => error.includes(expectedError)), JSON.stringify(validation.data));
    }
    const invalidLogicFlow = {
      apiName: 'Decision_Resource_Smoke', label: 'Decision Resource Smoke', flowType: 'Autolaunched Flow',
      status: 'Draft', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Decision', label: 'Invalid Logic', config: { outcomes: [
          { name: 'Invalid', label: 'Invalid', conditionLogic: '', conditions: [
            { field: '{Region}', operator: 'Equals', value: 'A' },
            { field: '{Region}', operator: 'Equals', value: 'B' }
          ] }
        ] } }
      ],
      connectors: [], resources: [], versions: []
    };
    for (const [logic, expectedError] of [['1 AND 4', 'condition 4'], ['1 XOR 2', 'invalid syntax'], ['(1 OR 2', 'unmatched opening']]) {
      const validation = await send('/metadata/flows/Decision_Resource_Smoke/validate', token, 'POST', {
        ...invalidLogicFlow,
        elements: invalidLogicFlow.elements.map((element) => element.type === 'Decision'
          ? { ...element, config: { ...element.config, outcomes: [{ name: 'Invalid', label: 'Invalid', conditionLogic: logic, conditions: [
            { field: '{Region}', operator: 'Equals', value: 'A' },
            { field: '{Region}', operator: 'Equals', value: 'B' }
          ] }] } }
          : element)
      });
      assert.equal(validation.status, 200, JSON.stringify(validation.data));
      assert.ok(validation.data.errors.some((error: string) => error.includes(expectedError)),
        `activation validation must reject custom logic with ${expectedError}`);
    }

    const beforeSaveFlow = await send('/metadata/flows/Before_Save_Assignment_Smoke', token, 'PUT', {
      apiName: 'Before_Save_Assignment_Smoke', label: 'Before Save Assignment Smoke', flowType: 'Record-Triggered Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: 'Account',
      startConfig: { trigger: 'created-or-updated', runWhen: 'before-save', conditionLogic: '1 OR 2 OR 3', entryConditions: [
        { field: 'Name', operator: 'Starts With', value: 'Before Save Create' },
        { field: 'Name', operator: 'Starts With', value: 'Before Save Update' },
        { field: 'Name', operator: 'Starts With', value: 'Flow DML' }
      ] },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Assignment', label: 'Normalize Name', config: {
          variable: '$Record.Name', operator: 'Add At End', value: ' [Processed]'
        } }
      ],
      connectors: [{ id: 'start-assignment', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(beforeSaveFlow.status, 200, JSON.stringify(beforeSaveFlow.data));
    const createdRecord = await send('/records/Account', token, 'POST', { Name: 'Before Save Create' });
    assert.equal(createdRecord.status, 201, JSON.stringify(createdRecord.data));
    assert.equal(createdRecord.data.record.Name, 'Before Save Create [Processed]',
      'before-save assignments must be persisted as part of record creation');
    const updatedRecord = await send(`/records/Account/${createdRecord.data.record.Id}`, token, 'PUT', { Name: 'Before Save Update' });
    assert.equal(updatedRecord.status, 200, JSON.stringify(updatedRecord.data));
    assert.equal(updatedRecord.data.record.Name, 'Before Save Update [Processed]',
      'before-save assignments must be persisted as part of record update');
    const recordContextFlow = await send('/metadata/flows/Formula_Record_Context_Smoke', token, 'PUT', {
      apiName: 'Formula_Record_Context_Smoke', label: 'Formula Record Context Smoke',
      flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: 'Account',
      startConfig: {
        trigger: 'created-or-updated', runWhen: 'before-save',
        entryConditions: [{ field: 'Name', operator: 'Starts With', value: 'Formula Context' }]
      },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Assignment', label: 'Set Formula Context Result', config: {
          variable: '$Record.Phone', operator: 'Assign', value: '{RecordContextResult}'
        } }
      ],
      connectors: [{ id: 'formula-context-assignment', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [{
        name: 'RecordContextResult', label: 'Record Context Result', type: 'Formula', dataType: 'Text',
        isCollection: false, availableForInput: false, availableForOutput: false,
        value: "IF(ISNEW(), 'created', IF(ISCHANGED(Name) AND PRIORVALUE(Name) = $Record__Prior.Name, PRIORVALUE(Name), 'unchanged'))"
      }],
      versions: []
    });
    assert.equal(recordContextFlow.status, 200, JSON.stringify(recordContextFlow.data));
    const formulaContextCreated = await send('/records/Account', token, 'POST', { Name: 'Formula Context Created' });
    assert.equal(formulaContextCreated.status, 201, JSON.stringify(formulaContextCreated.data));
    assert.equal(formulaContextCreated.data.record.Phone, 'created',
      'ISNEW must identify record-triggered creates');
    const formulaContextUpdated = await send(
      `/records/Account/${formulaContextCreated.data.record.Id}`, token, 'PUT', { Name: 'Formula Context Updated' }
    );
    assert.equal(formulaContextUpdated.status, 200, JSON.stringify(formulaContextUpdated.data));
    assert.equal(formulaContextUpdated.data.record.Phone, 'Formula Context Created',
      'ISCHANGED and PRIORVALUE must compare current and prior record values on update');
    const cloneContextFlow = await send('/metadata/flows/Formula_Clone_Context_Smoke', token, 'PUT', {
      apiName: 'Formula_Clone_Context_Smoke', label: 'Formula Clone Context Smoke',
      flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: 'Account',
      startConfig: {
        trigger: 'created', runWhen: 'before-save',
        entryConditions: [{ field: 'Name', operator: 'Starts With', value: 'Clone Context' }]
      },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Assignment', label: 'Set Clone Context Result', config: {
          variable: '$Record.Phone', operator: 'Assign', value: '{CloneContextResult}'
        } }
      ],
      connectors: [{ id: 'clone-context-assignment', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [{
        name: 'CloneContextResult', label: 'Clone Context Result', type: 'Formula', dataType: 'Text',
        isCollection: false, availableForInput: false, availableForOutput: false,
        value: "IF(ISCLONE(), 'cloned', 'created')"
      }],
      versions: []
    });
    assert.equal(cloneContextFlow.status, 200, JSON.stringify(cloneContextFlow.data));
    const cloneSourceRecord = await send('/records/Account', token, 'POST', { Name: 'Clone Context Source' });
    assert.equal(cloneSourceRecord.status, 201, JSON.stringify(cloneSourceRecord.data));
    assert.equal(cloneSourceRecord.data.record.Phone, 'created',
      'ISCLONE must be false for an ordinary record create');
    const cloneCreatedRecord = await send(
      `/records/Account?cloneFromId=${encodeURIComponent(cloneSourceRecord.data.record.Id)}`, token, 'POST', {}
    );
    assert.equal(cloneCreatedRecord.status, 201, JSON.stringify(cloneCreatedRecord.data));
    assert.equal(cloneCreatedRecord.data.record.Name, 'Clone Context Source',
      'clone creation must copy readable and editable source values');
    assert.equal(cloneCreatedRecord.data.record.Phone, 'cloned',
      'ISCLONE must be true throughout a clone-triggered before-save Flow');
    const invalidMutationFlow = await send('/metadata/flows/Before_Save_Invalid_Mutation_Smoke', token, 'PUT', {
      apiName: 'Before_Save_Invalid_Mutation_Smoke', label: 'Before Save Invalid Mutation Smoke',
      flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: 'Account',
      startConfig: { trigger: 'created', runWhen: 'before-save', entryConditions: [
        { field: 'Name', operator: 'Equals', value: 'Before Save Invalid' }
      ] },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Assignment', label: 'Set Invalid Employee Count', config: {
          variable: '$Record.AnnualRevenue', operator: 'Assign', value: 'not-a-number'
        } }
      ],
      connectors: [{ id: 'start-assignment', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(invalidMutationFlow.status, 200, JSON.stringify(invalidMutationFlow.data));
    const recordsBeforeRejectedFlow = (await send('/records/Account', token)).data.records.length as number;
    const rejectedMutation = await send('/records/Account', token, 'POST', { Name: 'Before Save Invalid' });
    assert.equal(rejectedMutation.status, 422, 'invalid field values from before-save assignments must be rejected');
    assert.equal((await send('/records/Account', token)).data.records.length, recordsBeforeRejectedFlow,
      'a failed before-save assignment must not persist a partial record');
    const internalCreateFlow = await send('/metadata/flows/Before_Save_Internal_Create_Smoke', token, 'PUT', {
      apiName: 'Before_Save_Internal_Create_Smoke', label: 'Before Save Internal Create Smoke',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Create Records', label: 'Create Account', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: 'Flow DML Create' }]
        } }
      ],
      connectors: [{ id: 'start-create', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(internalCreateFlow.status, 200, JSON.stringify(internalCreateFlow.data));
    const internalCreateRun = await send('/flows/Before_Save_Internal_Create_Smoke/execute', token, 'POST', {});
    assert.equal(internalCreateRun.status, 200, JSON.stringify(internalCreateRun.data));
    const accountList = await send('/records/Account', token);
    assert.ok(accountList.data.records.some((record: Record<string, unknown>) =>
      record.Name === 'Flow DML Create [Processed]'), 'before-save flows must run for records created by Flow data elements');
    const internalUpdateFlow = await send('/metadata/flows/Before_Save_Internal_Update_Smoke', token, 'PUT', {
      apiName: 'Before_Save_Internal_Update_Smoke', label: 'Before Save Internal Update Smoke',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Update Records', label: 'Update Account', config: {
          object: 'Account', conditionLogic: 'All',
          conditions: [{ field: 'Name', operator: 'Equals', value: 'Before Save Update [Processed]' }],
          fieldValues: [{ field: 'Name', value: 'Flow DML Update' }]
        } }
      ],
      connectors: [{ id: 'start-update', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(internalUpdateFlow.status, 200, JSON.stringify(internalUpdateFlow.data));
    const internalUpdateRun = await send('/flows/Before_Save_Internal_Update_Smoke/execute', token, 'POST', {});
    assert.equal(internalUpdateRun.status, 200, JSON.stringify(internalUpdateRun.data));
    const updatedAccountList = await send('/records/Account', token);
    assert.ok(updatedAccountList.data.records.some((record: Record<string, unknown>) =>
      record.Name === 'Flow DML Update [Processed]'), 'before-save flows must run for records updated by Flow data elements');
    const importBeforeSaveFlow = await send('/metadata/flows/Before_Save_Import_Smoke', token, 'PUT', {
      apiName: 'Before_Save_Import_Smoke', label: 'Before Save Import Smoke',
      flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: 'Contact',
      startConfig: { trigger: 'created', runWhen: 'before-save', triggerOrder: 1, entryConditions: [] },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Assignment', label: 'Set Imported Title', config: {
          variable: '$Record.Title', operator: 'Assign', value: 'Set by before-save flow'
        } }
      ],
      connectors: [{ id: 'start-assignment', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(importBeforeSaveFlow.status, 200, JSON.stringify(importBeforeSaveFlow.data));
    const importedContacts = await send('/records/Contact/import', token, 'POST', {
      records: [{ Name: 'Before Save Imported Contact' }]
    });
    assert.equal(importedContacts.status, 201, JSON.stringify(importedContacts.data));
    assert.equal(importedContacts.data.records[0].Title, 'Set by before-save flow',
      'before-save flows must run for imported records');
    for (const configuredFlow of [
      {
        apiName: 'Contact_Order_20_Smoke',
        triggerOrder: 20,
        condition: { field: 'Title', operator: 'Equals', value: 'Set by ordered flow 10' },
        assignedValue: 'Set by ordered flow 20'
      },
      {
        apiName: 'Contact_Order_10_Smoke',
        triggerOrder: 10,
        condition: { field: 'Name', operator: 'Equals', value: 'Trigger Order Contact' },
        assignedValue: 'Set by ordered flow 10'
      }
    ]) {
      const orderedFlow = await send(`/metadata/flows/${configuredFlow.apiName}`, token, 'PUT', {
        apiName: configuredFlow.apiName,
        label: configuredFlow.apiName.replace(/_/g, ' '),
        flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
        triggerObject: 'Contact',
        startConfig: {
          trigger: 'created', runWhen: 'before-save', triggerOrder: configuredFlow.triggerOrder,
          conditionLogic: 'All', entryConditions: [configuredFlow.condition]
        },
        elements: [
          { id: 1, type: 'Start', label: 'Start', config: {} },
          { id: 2, type: 'Assignment', label: `Set Title ${configuredFlow.triggerOrder}`, config: {
            variable: '$Record.Title', operator: 'Assign', value: configuredFlow.assignedValue
          } }
        ],
        connectors: [{ id: `start-assignment-${configuredFlow.triggerOrder}`, from: 1, to: 2, label: '', kind: 'normal' }],
        resources: [], versions: []
      });
      assert.equal(orderedFlow.status, 200, JSON.stringify(orderedFlow.data));
    }
    const orderedContact = await send('/records/Contact', token, 'POST', { Name: 'Trigger Order Contact' });
    assert.equal(orderedContact.status, 201, JSON.stringify(orderedContact.data));
    assert.equal(orderedContact.data.record.Title, 'Set by ordered flow 20',
      'before-save flows must run by trigger order and later flows must see earlier field assignments');
    const orderedImport = await send('/records/Contact/import', token, 'POST', {
      records: [{ Name: 'Trigger Order Contact' }, { Name: 'No Ordered Match' }]
    });
    assert.equal(orderedImport.status, 201, JSON.stringify(orderedImport.data));
    assert.deepEqual(orderedImport.data.records.map((record: Record<string, unknown>) => record.Title),
      ['Set by ordered flow 20', 'Set by before-save flow'],
      'bulk imports must run the ordered before-save flows independently against each record');
    for (const configuredFlow of [
      { apiName: 'Account_After_Order_20_Smoke', triggerOrder: 20, childName: 'After Order Child 20' },
      { apiName: 'Account_After_Order_10_Smoke', triggerOrder: 10, childName: 'After Order Child 10' }
    ]) {
      const orderedFlow = await send(`/metadata/flows/${configuredFlow.apiName}`, token, 'PUT', {
        apiName: configuredFlow.apiName,
        label: configuredFlow.apiName.replace(/_/g, ' '),
        flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
        triggerObject: 'Account',
        startConfig: {
          trigger: 'created', runWhen: 'after-save', triggerOrder: configuredFlow.triggerOrder,
          entryConditions: [{ field: 'Name', operator: 'Equals', value: 'After Order Parent' }]
        },
        elements: [
          { id: 1, type: 'Start', label: 'Start', config: {} },
          { id: 2, type: 'Create Records', label: `Create Child ${configuredFlow.triggerOrder}`, config: {
            object: 'Account', fieldValues: [{ field: 'Name', value: configuredFlow.childName }]
          } }
        ],
        connectors: [{ id: `start-create-${configuredFlow.triggerOrder}`, from: 1, to: 2, label: '', kind: 'normal' }],
        resources: [], versions: []
      });
      assert.equal(orderedFlow.status, 200, JSON.stringify(orderedFlow.data));
    }
    const orderedParent = await send('/records/Account', token, 'POST', { Name: 'After Order Parent' });
    assert.equal(orderedParent.status, 201, JSON.stringify(orderedParent.data));
    const accountsAfterOrderedTriggers = await send('/records/Account', token);
    const orderedChildren = accountsAfterOrderedTriggers.data.records
      .map((record: Record<string, unknown>) => record.Name)
      .filter((name: unknown) => typeof name === 'string' && name.startsWith('After Order Child'));
    assert.deepEqual(orderedChildren, ['After Order Child 10', 'After Order Child 20'],
      `after-save flows must execute in trigger order even when metadata was inserted in reverse order: ${JSON.stringify(accountsAfterOrderedTriggers.data.records.map((record: Record<string, unknown>) => record.Name))}`);
    const transitionFlow = await send('/metadata/flows/Contact_Transition_Smoke', token, 'PUT', {
      apiName: 'Contact_Transition_Smoke', label: 'Contact Transition Smoke',
      flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: 'Contact',
      startConfig: {
        trigger: 'updated', runWhen: 'after-save', updatedRecordBehavior: 'transition',
        entryConditions: [{ field: 'Name', operator: 'Equals', value: 'Transition Enabled' }]
      },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Create Records', label: 'Create transition marker', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: 'Transition Fired' }]
        } }
      ],
      connectors: [{ id: 'start-create-transition', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(transitionFlow.status, 200, JSON.stringify(transitionFlow.data));
    const transitionContact = await send('/records/Contact', token, 'POST', { Name: 'Transition Disabled' });
    assert.equal(transitionContact.status, 201, JSON.stringify(transitionContact.data));
    const transitionStarted = await send(`/records/Contact/${transitionContact.data.record.Id}`, token, 'PUT', {
      Name: 'Transition Enabled'
    });
    assert.equal(transitionStarted.status, 200, JSON.stringify(transitionStarted.data));
    const transitionRepeated = await send(`/records/Contact/${transitionContact.data.record.Id}`, token, 'PUT', {
      Title: 'Updated while condition remains true'
    });
    assert.equal(transitionRepeated.status, 200, JSON.stringify(transitionRepeated.data));
    const transitionAccounts = await send('/records/Account', token);
    assert.equal(transitionAccounts.data.records.filter((record: Record<string, unknown>) =>
      record.Name === 'Transition Fired').length, 1,
    'updated-record transition flows must run only when entry conditions change from false to true');
    const deletedRecordFlowDefinition = {
      apiName: 'Contact_Deleted_Record_Smoke', label: 'Contact Deleted Record Smoke',
      flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: 'Contact',
      startConfig: {
        trigger: 'deleted', runWhen: 'after-save',
        entryConditions: [{ field: 'Name', operator: 'Equals', value: 'Delete Trigger Contact' }]
      },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Create Records', label: 'Create Delete Marker', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: 'Contact Delete Trigger Fired' }]
        } }
      ],
      connectors: [{ id: 'start-delete-marker', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    };
    const invalidBeforeSaveDelete = await send('/metadata/flows/Contact_Deleted_Record_Smoke/validate', token, 'POST', {
      ...deletedRecordFlowDefinition,
      startConfig: { ...deletedRecordFlowDefinition.startConfig, runWhen: 'before-save' }
    });
    assert.equal(invalidBeforeSaveDelete.status, 200, JSON.stringify(invalidBeforeSaveDelete.data));
    assert.ok(invalidBeforeSaveDelete.data.errors.some((error: string) =>
      error.includes('Before-save record-triggered flows cannot run when a record is deleted')),
    JSON.stringify(invalidBeforeSaveDelete.data));
    const deletedRecordFlow = await send('/metadata/flows/Contact_Deleted_Record_Smoke', token, 'PUT', deletedRecordFlowDefinition);
    assert.equal(deletedRecordFlow.status, 200, JSON.stringify(deletedRecordFlow.data));
    const deleteTriggerContact = await send('/records/Contact', token, 'POST', { Name: 'Delete Trigger Contact' });
    assert.equal(deleteTriggerContact.status, 201, JSON.stringify(deleteTriggerContact.data));
    const deletedContact = await send(`/records/Contact/${deleteTriggerContact.data.record.Id}`, token, 'DELETE');
    assert.equal(deletedContact.status, 204, JSON.stringify(deletedContact.data));
    const deletedTriggerAccounts = await send('/records/Account', token);
    assert.equal(deletedTriggerAccounts.data.records.filter((record: Record<string, unknown>) =>
      record.Name === 'Contact Delete Trigger Fired').length, 1,
    'after-save delete-trigger flows must execute with the deleted record context');
    const rollbackTarget = await send('/records/Account', token, 'POST', { Name: 'Transaction Rollback Target', AnnualRevenue: 125 });
    assert.equal(rollbackTarget.status, 201, JSON.stringify(rollbackTarget.data));
    const rollbackFlow = await send('/metadata/flows/Contact_Transaction_Rollback_Smoke', token, 'PUT', {
      apiName: 'Contact_Transaction_Rollback_Smoke',
      label: 'Contact Transaction Rollback Smoke',
      flowType: 'Record-Triggered Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: 'Contact',
      startConfig: {
        trigger: 'created', runWhen: 'after-save',
        entryConditions: [{ field: 'Name', operator: 'Equals', value: 'Fail Transaction' }]
      },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Create Records', label: 'Create rollback side effect', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: 'Must Roll Back Flow DML' }]
        } },
        { id: 3, type: 'Update Records', label: 'Fail the transaction', config: {
          object: 'Account', conditionLogic: 'All',
          conditions: [{ field: 'Name', operator: 'Equals', value: 'Transaction Rollback Target' }],
          fieldValues: [{ field: 'AnnualRevenue', value: 'not-a-number' }]
        } }
      ],
      connectors: [
        { id: 'start-create-side-effect', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'create-side-effect-fail', from: 2, to: 3, label: '', kind: 'normal' }
      ],
      resources: [], versions: []
    });
    assert.equal(rollbackFlow.status, 200, JSON.stringify(rollbackFlow.data));
    const rollbackImport = await send('/records/Contact/import', token, 'POST', {
      records: [{ Name: 'Transaction Should Roll Back' }, { Name: 'Fail Transaction' }]
    });
    assert.equal(rollbackImport.status, 422, JSON.stringify(rollbackImport.data));
    const contactsAfterRollback = await send('/records/Contact', token);
    assert.ok(!contactsAfterRollback.data.records.some((record: Record<string, unknown>) =>
      ['Transaction Should Roll Back', 'Fail Transaction'].includes(String(record.Name))),
    'a failed after-save flow must roll back every row in the import batch');
    const accountsAfterRollback = await send('/records/Account', token);
    assert.ok(!accountsAfterRollback.data.records.some((record: Record<string, unknown>) =>
      record.Name === 'Must Roll Back Flow DML'),
    'Flow DML completed before a later fault must roll back with the import');
    assert.equal(accountsAfterRollback.data.records.find((record: Record<string, unknown>) =>
      record.Id === rollbackTarget.data.record.Id)?.AnnualRevenue, 125,
    'failed Flow DML must not partially update an existing record');
    const rollbackElementFlow = await send('/metadata/flows/Flow_Rollback_Element_Smoke', token, 'PUT', {
      apiName: 'Flow_Rollback_Element_Smoke',
      label: 'Flow Roll Back Records Element Smoke',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Create Records', label: 'Create before rollback', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: 'Flow Element Must Roll Back' }]
        } },
        { id: 3, type: 'Update Records', label: 'Update before rollback', config: {
          object: 'Account', conditionLogic: 'All',
          conditions: [{ field: 'Name', operator: 'Equals', value: 'Transaction Rollback Target' }],
          fieldValues: [{ field: 'AnnualRevenue', value: 500 }]
        } },
        { id: 4, type: 'Roll Back Records', label: 'Roll Back Records', config: {} },
        { id: 5, type: 'Create Records', label: 'Create after rollback', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: 'Flow Element After Rollback' }]
        } },
        { id: 6, type: 'End', label: 'End', config: {} }
      ],
      connectors: [
        { id: 'rollback-start-create', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'rollback-create-update', from: 2, to: 3, label: '', kind: 'normal' },
        { id: 'rollback-update-element', from: 3, to: 4, label: '', kind: 'normal' },
        { id: 'rollback-element-create', from: 4, to: 5, label: '', kind: 'normal' },
        { id: 'rollback-create-end', from: 5, to: 6, label: '', kind: 'normal' }
      ],
      resources: [], versions: []
    });
    assert.equal(rollbackElementFlow.status, 200, JSON.stringify(rollbackElementFlow.data));
    const recordsBeforeRollbackDebug = (await send('/records/Account', token)).data.records.length as number;
    const rollbackElementDebug = await send('/flows/Flow_Rollback_Element_Smoke/debug', token, 'POST', {});
    assert.equal(rollbackElementDebug.status, 200, JSON.stringify(rollbackElementDebug.data));
    assert.equal(rollbackElementDebug.data.sideEffectsSimulated, true);
    assert.equal((await send('/records/Account', token)).data.records.length, recordsBeforeRollbackDebug,
      'debugging through Roll Back Records must not persist subsequent Flow DML');
    const rollbackElementRun = await send('/flows/Flow_Rollback_Element_Smoke/execute', token, 'POST', {});
    assert.equal(rollbackElementRun.status, 200, JSON.stringify(rollbackElementRun.data));
    const accountsAfterRollbackElement = await send('/records/Account', token);
    assert.ok(!accountsAfterRollbackElement.data.records.some((record: Record<string, unknown>) =>
      record.Name === 'Flow Element Must Roll Back'),
    'Roll Back Records must discard Flow-created records from the current transaction');
    assert.equal(accountsAfterRollbackElement.data.records.find((record: Record<string, unknown>) =>
      record.Id === rollbackTarget.data.record.Id)?.AnnualRevenue, 125,
    'Roll Back Records must restore updates made earlier in the Flow transaction');
    assert.ok(accountsAfterRollbackElement.data.records.some((record: Record<string, unknown>) =>
      record.Name === 'Flow Element After Rollback'),
    'the Flow must continue and commit DML after Roll Back Records');
    const rollbackSubflow = await send('/metadata/flows/Flow_Rollback_Subflow_Smoke', token, 'PUT', {
      apiName: 'Flow_Rollback_Subflow_Smoke', label: 'Flow Roll Back Records Subflow Smoke',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Roll Back Records', label: 'Roll Back Records', config: {} },
        { id: 3, type: 'End', label: 'End', config: {} }
      ],
      connectors: [{ id: 'rollback-subflow-start', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'rollback-subflow-end', from: 2, to: 3, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(rollbackSubflow.status, 200, JSON.stringify(rollbackSubflow.data));
    const rollbackSubflowParent = await send('/metadata/flows/Flow_Rollback_Subflow_Parent_Smoke', token, 'PUT', {
      apiName: 'Flow_Rollback_Subflow_Parent_Smoke', label: 'Flow Roll Back Records Parent Smoke',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Create Records', label: 'Create before subflow rollback', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: 'Flow Subflow Must Roll Back' }]
        } },
        { id: 3, type: 'Subflow', label: 'Run rollback subflow', config: { flowApiName: 'Flow_Rollback_Subflow_Smoke' } },
        { id: 4, type: 'Create Records', label: 'Create after subflow rollback', config: {
          object: 'Account', fieldValues: [{ field: 'Name', value: 'Flow Subflow After Rollback' }]
        } },
        { id: 5, type: 'End', label: 'End', config: {} }
      ],
      connectors: [
        { id: 'rollback-parent-create-subflow', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'rollback-parent-subflow-create', from: 2, to: 3, label: '', kind: 'normal' },
        { id: 'rollback-parent-create-end', from: 3, to: 4, label: '', kind: 'normal' },
        { id: 'rollback-parent-end', from: 4, to: 5, label: '', kind: 'normal' }
      ],
      resources: [], versions: []
    });
    assert.equal(rollbackSubflowParent.status, 200, JSON.stringify(rollbackSubflowParent.data));
    const rollbackSubflowRun = await send('/flows/Flow_Rollback_Subflow_Parent_Smoke/execute', token, 'POST', {});
    assert.equal(rollbackSubflowRun.status, 200, JSON.stringify(rollbackSubflowRun.data));
    const accountsAfterSubflowRollback = await send('/records/Account', token);
    assert.ok(!accountsAfterSubflowRollback.data.records.some((record: Record<string, unknown>) =>
      record.Name === 'Flow Subflow Must Roll Back'),
    'a subflow Roll Back Records element must revert parent Flow DML');
    assert.ok(accountsAfterSubflowRollback.data.records.some((record: Record<string, unknown>) =>
      record.Name === 'Flow Subflow After Rollback'),
    'the parent Flow must continue after its subflow rolls back transaction changes');
    const invalidTriggerOrder = await send('/metadata/flows/Contact_Order_10_Smoke/validate', token, 'POST', {
      ...orderedImport.data.flow,
      apiName: 'Contact_Order_10_Smoke',
      label: 'Invalid Trigger Order',
      flowType: 'Record-Triggered Flow',
      status: 'Draft',
      versionNumber: 1,
      activeVersion: null,
      triggerObject: 'Contact',
      startConfig: { trigger: 'created', runWhen: 'before-save', triggerOrder: 2001, entryConditions: [] },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} }
      ],
      connectors: [], resources: [], versions: []
    });
    assert.ok(invalidTriggerOrder.data.errors.some((error: string) => error.includes('integer from 1 through 2000')),
      JSON.stringify(invalidTriggerOrder.data));
    const invalidBeforeSaveTarget = await send('/metadata/flows/Before_Save_Assignment_Smoke/validate', token, 'POST', {
      apiName: 'Before_Save_Assignment_Smoke', label: 'Invalid After Save Assignment', flowType: 'Record-Triggered Flow',
      status: 'Draft', versionNumber: 1, activeVersion: null, triggerObject: 'Account',
      startConfig: { trigger: 'created', runWhen: 'after-save', entryConditions: [] },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Assignment', label: 'Invalid Target', config: { variable: '$Record.Name', operator: 'Assign', value: 'Not Allowed' } }
      ],
      connectors: [{ id: 'start-assignment', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(invalidBeforeSaveTarget.status, 200, JSON.stringify(invalidBeforeSaveTarget.data));
    assert.ok(invalidBeforeSaveTarget.data.errors.some((error: string) => error.includes('only in before-save')),
      JSON.stringify(invalidBeforeSaveTarget.data));
    const invalidAssignmentOperator = await send('/metadata/flows/Before_Save_Assignment_Smoke/validate', token, 'POST', {
      apiName: 'Before_Save_Assignment_Smoke', label: 'Invalid Assignment Operator', flowType: 'Record-Triggered Flow',
      status: 'Draft', versionNumber: 1, activeVersion: null, triggerObject: 'Account',
      startConfig: { trigger: 'created', runWhen: 'before-save', entryConditions: [] },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Assignment', label: 'Invalid Operator', config: {
          variable: '$Record.Name', operator: 'Append', value: 'Invalid'
        } }
      ],
      connectors: [{ id: 'start-assignment', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(invalidAssignmentOperator.status, 200, JSON.stringify(invalidAssignmentOperator.data));
    assert.ok(invalidAssignmentOperator.data.errors.some((error: string) => error.includes('unsupported operator')),
      JSON.stringify(invalidAssignmentOperator.data));
    const invalidBeforeDelete = await send('/metadata/flows/Before_Save_Assignment_Smoke/validate', token, 'POST', {
      apiName: 'Before_Save_Assignment_Smoke', label: 'Invalid Before Delete Flow', flowType: 'Record-Triggered Flow',
      status: 'Draft', versionNumber: 1, activeVersion: null, triggerObject: 'Account',
      startConfig: { trigger: 'deleted', runWhen: 'before-save', entryConditions: [] },
      elements: [{ id: 1, type: 'Start', label: 'Start', config: {} }],
      connectors: [], resources: [], versions: []
    });
    assert.equal(invalidBeforeDelete.status, 200, JSON.stringify(invalidBeforeDelete.data));
    assert.ok(invalidBeforeDelete.data.errors.some((error: string) => error.includes('cannot run when a record is deleted')),
      JSON.stringify(invalidBeforeDelete.data));

    const screenFlow = await send('/metadata/flows/Screen_Choice_Smoke', token, 'PUT', {
      apiName: 'Screen_Choice_Smoke', label: 'Screen Choice Smoke', flowType: 'Screen Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Screen', label: 'Collect Preferences', config: {
          fields: [
            { label: 'Your Preferences', type: 'Section', description: 'Tell us how you would like to hear from us.', columns: 2 },
            { label: 'Instructions', apiName: 'Instructions', type: 'Display Text', text: 'Choose your topics and region.' },
            { label: 'Product mark', type: 'Display Image', imageUrl: 'https://example.test/assets/mark.png', imageAltText: 'Product mark' },
            { label: 'Topics', apiName: 'Topics', type: 'Multi-Select Picklist', displayAs: 'Checkbox Group', required: true, choices: ['Sales', 'Service'] },
            { label: 'Region', apiName: 'Region', type: 'Picklist', displayAs: 'Radio Buttons', required: true, choices: ['East', 'West'] },
            { label: 'Secret answer', apiName: 'SecretAnswer', type: 'Password', required: true, minLength: 4, maxLength: 32 },
            { label: 'Website', apiName: 'Website', type: 'URL', required: false },
            { label: 'Notes', apiName: 'Notes', type: 'Long Text Area', required: false },
            { label: 'Mode', apiName: 'Mode', type: 'Picklist', required: false, choices: ['Standard', 'Other'] },
            { label: 'Reference Code', apiName: 'ReferenceCode', type: 'Text', required: true, pattern: '[A-Z]{2}', validationMessage: 'Enter two uppercase letters.', visibilityConditions: [{ field: 'Mode', operator: 'Equals', value: 'Other' }] },
            { label: 'Confidence', apiName: 'Confidence', type: 'Slider', min: 0, max: 10, step: 2 },
            { label: 'Enabled', apiName: 'Enabled', type: 'Toggle', required: false }
          ]
        } }
      ],
      connectors: [{ id: 'start-screen', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [],
      versions: []
    });
    assert.equal(screenFlow.status, 200, JSON.stringify(screenFlow.data));
    const choiceLookupTarget = await send('/records/Account', token, 'POST', { Name: 'Choice Lookup Target' });
    assert.equal(choiceLookupTarget.status, 201, JSON.stringify(choiceLookupTarget.data));
    const secondChoiceLookupTarget = await send('/records/Account', token, 'POST', { Name: 'Second Choice Lookup Target' });
    assert.equal(secondChoiceLookupTarget.status, 201, JSON.stringify(secondChoiceLookupTarget.data));
    const choiceLookupFlow = await send('/metadata/flows/Screen_Choice_Lookup_Smoke', token, 'PUT', {
      apiName: 'Screen_Choice_Lookup_Smoke', label: 'Screen Choice Lookup Smoke', flowType: 'Screen Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Screen', label: 'Choose Accounts', config: { fields: [
          { label: 'Primary Account', apiName: 'PrimaryAccount', type: 'Choice Lookup', objectApiName: 'Account',
            displayField: 'Name', required: false },
          { label: 'Accounts', apiName: 'Accounts', type: 'Choice Lookup', objectApiName: 'Account',
            displayField: 'Name', multipleSelections: true, required: true }
        ] } }
      ],
      connectors: [{ id: 'start-choice-lookup', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(choiceLookupFlow.status, 200, JSON.stringify(choiceLookupFlow.data));
    const choiceLookupInterview = await send('/flows/Screen_Choice_Lookup_Smoke/execute', token, 'POST', {});
    assert.equal(choiceLookupInterview.status, 202, JSON.stringify(choiceLookupInterview.data));
    const invalidChoiceLookup = await send(`/flow-interviews/${choiceLookupInterview.data.interviewId}/next`, token, 'POST', {
      values: { Accounts: ['not-a-readable-account-id'] }
    });
    assert.equal(invalidChoiceLookup.status, 400, 'Choice Lookup must reject records outside the readable target object');
    const invalidChoiceLookupMode = await send(`/flow-interviews/${choiceLookupInterview.data.interviewId}/next`, token, 'POST', {
      values: { PrimaryAccount: [choiceLookupTarget.data.record.Id, secondChoiceLookupTarget.data.record.Id],
        Accounts: [choiceLookupTarget.data.record.Id] }
    });
    assert.equal(invalidChoiceLookupMode.status, 400, 'single-select Choice Lookup must reject array values');
    const invalidMultipleChoiceLookupMode = await send(`/flow-interviews/${choiceLookupInterview.data.interviewId}/next`, token, 'POST', {
      values: { PrimaryAccount: choiceLookupTarget.data.record.Id, Accounts: choiceLookupTarget.data.record.Id }
    });
    assert.equal(invalidMultipleChoiceLookupMode.status, 400, 'multiple-select Choice Lookup must require an array value');
    const submittedChoiceLookup = await send(`/flow-interviews/${choiceLookupInterview.data.interviewId}/next`, token, 'POST', {
      values: { PrimaryAccount: choiceLookupTarget.data.record.Id, Accounts: [choiceLookupTarget.data.record.Id] }
    });
    assert.equal(submittedChoiceLookup.status, 200, JSON.stringify(submittedChoiceLookup.data));
    const invalidChoiceLookupField = await send('/metadata/flows/Screen_Choice_Lookup_Smoke/validate', token, 'POST', {
      ...choiceLookupFlow.data.flow,
      status: 'Draft',
      elements: choiceLookupFlow.data.flow.elements.map((element: Record<string, any>) => element.type === 'Screen'
        ? { ...element, config: { ...element.config, fields: element.config.fields.map((field: Record<string, unknown>) =>
          ({ ...field, displayField: 'Missing_Field__c' })) } }
        : element)
    });
    assert.ok(invalidChoiceLookupField.data.errors.some((error: string) => error.includes('requires a valid choice label field')),
      JSON.stringify(invalidChoiceLookupField.data));
    const screenDebug = await send('/flows/Screen_Choice_Smoke/debug', token, 'POST', {});
    assert.equal(screenDebug.status, 200, JSON.stringify(screenDebug.data));
    assert.equal(screenDebug.data.status, 'waiting');
    assert.equal(screenDebug.data.kind, 'screen');
    assert.equal(screenDebug.data.screen.label, 'Collect Preferences');
    assert.equal(screenDebug.data.interviewId, undefined,
      'debugging a Screen Flow must pause at the screen without creating a persisted interview');
    const unsupportedScreenType = await send('/metadata/flows/Screen_Choice_Smoke/validate', token, 'POST', {
      ...screenFlow.data.flow,
      status: 'Draft',
      elements: screenFlow.data.flow.elements.map((element: Record<string, any>) => element.type === 'Screen'
        ? { ...element, config: { ...element.config, fields: element.config.fields.map((field: Record<string, unknown>) =>
          field.apiName === 'Notes' ? { ...field, type: 'Rich Text' } : field) } }
        : element)
    });
    assert.ok(unsupportedScreenType.data.errors.some((error: string) => error.includes('unsupported data type "Rich Text"')),
      JSON.stringify(unsupportedScreenType.data));
    const invalidDisplayImage = await send('/metadata/flows/Screen_Choice_Smoke/validate', token, 'POST', {
      ...screenFlow.data.flow,
      status: 'Draft',
      elements: screenFlow.data.flow.elements.map((element: Record<string, any>) => element.type === 'Screen'
        ? { ...element, config: { ...element.config, fields: element.config.fields.map((field: Record<string, unknown>) =>
          field.type === 'Display Image' ? { ...field, imageUrl: 'javascript:alert(1)' } : field) } }
        : element)
    });
    assert.ok(invalidDisplayImage.data.errors.some((error: string) => error.includes('requires an HTTPS image URL')),
      JSON.stringify(invalidDisplayImage.data));
    const credentialedDisplayImage = await send('/metadata/flows/Screen_Choice_Smoke/validate', token, 'POST', {
      ...screenFlow.data.flow,
      status: 'Draft',
      elements: screenFlow.data.flow.elements.map((element: Record<string, any>) => element.type === 'Screen'
        ? { ...element, config: { ...element.config, fields: element.config.fields.map((field: Record<string, unknown>) =>
          field.type === 'Display Image' ? { ...field, imageUrl: 'https://user:secret@example.test/image.png' } : field) } }
        : element)
    });
    assert.ok(credentialedDisplayImage.data.errors.some((error: string) => error.includes('requires an HTTPS image URL')),
      JSON.stringify(credentialedDisplayImage.data));
    const invalidSectionColumns = await send('/metadata/flows/Screen_Choice_Smoke/validate', token, 'POST', {
      ...screenFlow.data.flow,
      status: 'Draft',
      elements: screenFlow.data.flow.elements.map((element: Record<string, any>) => element.type === 'Screen'
        ? { ...element, config: { ...element.config, fields: element.config.fields.map((field: Record<string, unknown>) =>
          field.type === 'Section' ? { ...field, columns: 3 } : field) } }
        : element)
    });
    assert.ok(invalidSectionColumns.data.errors.some((error: string) => error.includes('must contain one or two columns')),
      JSON.stringify(invalidSectionColumns.data));
    const startedScreen = await send('/flows/Screen_Choice_Smoke/execute', token, 'POST', {});
    assert.equal(startedScreen.status, 202, JSON.stringify(startedScreen.data));
    const cancellableScreen = await send('/flows/Screen_Choice_Smoke/execute', token, 'POST', {});
    assert.equal(cancellableScreen.status, 202, JSON.stringify(cancellableScreen.data));
    const pendingFlowInterviews = await send('/metadata/flow-interviews', token);
    assert.equal(pendingFlowInterviews.status, 200, JSON.stringify(pendingFlowInterviews.data));
    const pendingInterview = pendingFlowInterviews.data.interviews.find((item: Record<string, unknown>) =>
      item.id === cancellableScreen.data.interviewId);
    assert.equal(pendingInterview.flowApiName, 'Screen_Choice_Smoke');
    assert.equal(pendingInterview.kind, 'screen');
    assert.equal(pendingInterview.screenLabel, 'Collect Preferences');
    assert.equal(Object.hasOwn(pendingInterview, 'variables'), false,
      'the operations list must not expose persisted variable values');
    assert.equal((await send(`/metadata/flow-interviews/${cancellableScreen.data.interviewId}`, token, 'DELETE')).status, 204);
    const interviewsAfterCancel = await send('/metadata/flow-interviews', token);
    assert.equal(interviewsAfterCancel.data.interviews.some((item: Record<string, unknown>) =>
      item.id === cancellableScreen.data.interviewId), false);
    assert.equal((await send(`/metadata/flow-interviews/${cancellableScreen.data.interviewId}`, token, 'DELETE')).status, 404,
      'an interview may only be canceled once');
    const invalidChoices = await send(`/flow-interviews/${startedScreen.data.interviewId}/next`, token, 'POST', {
      values: { Topics: ['Sales', 'Unknown'], Region: 'East' }
    });
    assert.equal(invalidChoices.status, 400, 'screen multi-select values must belong to the configured choices');
    const missingRadioChoice = await send(`/flow-interviews/${startedScreen.data.interviewId}/next`, token, 'POST', {
      values: { Topics: ['Sales'] }
    });
    assert.equal(missingRadioChoice.status, 400, 'required radio-button picklists must have a selected choice');
    const displayTextSubmitted = await send(`/flow-interviews/${startedScreen.data.interviewId}/next`, token, 'POST', {
      values: { Topics: ['Sales'], Region: 'East', Instructions: 'forged input' }
    });
    assert.equal(displayTextSubmitted.status, 400, 'Display Text components cannot be submitted as Flow input variables');
    const displayImageSubmitted = await send(`/flow-interviews/${startedScreen.data.interviewId}/next`, token, 'POST', {
      values: { Product_mark: 'forged input' }
    });
    assert.equal(displayImageSubmitted.status, 400, 'Display Image components cannot be submitted as Flow input variables');
    const sectionSubmitted = await send(`/flow-interviews/${startedScreen.data.interviewId}/next`, token, 'POST', {
      values: { Your_Preferences: 'forged input' }
    });
    assert.equal(sectionSubmitted.status, 400, 'Section components cannot be submitted as Flow input variables');
    const invalidUrl = await send(`/flow-interviews/${startedScreen.data.interviewId}/next`, token, 'POST', {
      values: { Topics: ['Sales', 'Service'], Region: 'East', Website: 'not a URL' }
    });
    assert.equal(invalidUrl.status, 400, 'URL screen fields must be validated by the server');
    const invalidNotes = await send(`/flow-interviews/${startedScreen.data.interviewId}/next`, token, 'POST', {
      values: { Topics: ['Sales', 'Service'], Region: 'East', Website: 'https://example.net/path', Notes: { forged: true } }
    });
    assert.equal(invalidNotes.status, 400, 'text screen fields must reject non-string values on the server');
    const missingConditionalValue = await send(`/flow-interviews/${startedScreen.data.interviewId}/next`, token, 'POST', {
      values: { Topics: ['Sales'], Region: 'East', Mode: 'Other' }
    });
    assert.equal(missingConditionalValue.status, 400,
      'conditionally visible required fields must be required when their visibility conditions match');
    const invalidPattern = await send(`/flow-interviews/${startedScreen.data.interviewId}/next`, token, 'POST', {
      values: { Topics: ['Sales'], Region: 'East', Mode: 'Other', ReferenceCode: 'abc' }
    });
    assert.equal(invalidPattern.status, 400, 'screen validation patterns must be enforced server-side');
    const invalidSliderStep = await send(`/flow-interviews/${startedScreen.data.interviewId}/next`, token, 'POST', {
      values: { Topics: ['Sales'], Region: 'East', Mode: 'Other', ReferenceCode: 'AB', Confidence: 7 }
    });
    assert.equal(invalidSliderStep.status, 400, 'numeric Screen inputs must honor configured increments');
    const invalidUrlScheme = await send(`/flow-interviews/${startedScreen.data.interviewId}/next`, token, 'POST', {
      values: { Topics: ['Sales'], Region: 'East', Website: 'ftp://example.net', Mode: 'Other', ReferenceCode: 'AB' }
    });
    assert.equal(invalidUrlScheme.status, 400, 'Screen URL inputs must restrict schemes to HTTP and HTTPS');
    const submittedScreen = await send(`/flow-interviews/${startedScreen.data.interviewId}/next`, token, 'POST', {
      values: { Topics: ['Sales', 'Service'], Region: 'West', SecretAnswer: 'private-answer', Website: 'https://example.net/path', Notes: 'Confirmed', Mode: 'Other', ReferenceCode: 'AB', Confidence: 8, Enabled: true }
    });
    assert.equal(submittedScreen.status, 200, JSON.stringify(submittedScreen.data));
    const navigationFlow = await send('/metadata/flows/Screen_Navigation_Smoke', token, 'PUT', {
      apiName: 'Screen_Navigation_Smoke', label: 'Screen Navigation Smoke', flowType: 'Screen Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Screen', label: 'First Screen', config: { fields: [
          { label: 'First Answer', apiName: 'FirstAnswer', type: 'Text', required: true }
        ] } },
        { id: 3, type: 'Screen', label: 'Second Screen', config: { fields: [
          { label: 'Second Answer', apiName: 'SecondAnswer', type: 'Text', required: true }
        ] } }
      ],
      connectors: [
        { id: 'start-first-screen', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'first-second-screen', from: 2, to: 3, label: '', kind: 'normal' }
      ],
      resources: [
        {
          name: 'FlowInterviewGuid', label: 'Flow Interview Guid', type: 'Formula', dataType: 'Text',
          isCollection: false, availableForInput: false, availableForOutput: true, value: '$Flow.InterviewGuid'
        },
        {
          name: 'FlowInterviewStartTime', label: 'Flow Interview Start Time', type: 'Formula', dataType: 'Date/Time',
          isCollection: false, availableForInput: false, availableForOutput: true, value: '$Flow.InterviewStartTime'
        }
      ],
      versions: []
    });
    assert.equal(navigationFlow.status, 200, JSON.stringify(navigationFlow.data));
    const navigationStartedAt = Date.now();
    const navigationStarted = await send('/flows/Screen_Navigation_Smoke/execute', token, 'POST', {});
    assert.equal(navigationStarted.status, 202, JSON.stringify(navigationStarted.data));
    const navigationAdvanced = await send(`/flow-interviews/${navigationStarted.data.interviewId}/next`, token, 'POST', {
      values: { FirstAnswer: 'remember me' }
    });
    assert.equal(navigationAdvanced.status, 202, JSON.stringify(navigationAdvanced.data));
    assert.equal(navigationAdvanced.data.canGoBack, true, 'screen interviews should expose Back after advancing');
    const navigationBack = await send(`/flow-interviews/${navigationStarted.data.interviewId}/next`, token, 'POST', {
      action: 'back'
    });
    assert.equal(navigationBack.status, 200, JSON.stringify(navigationBack.data));
    assert.equal(navigationBack.data.screen.label, 'First Screen');
    assert.equal(navigationBack.data.values.FirstAnswer, 'remember me', 'Back navigation must restore prior screen inputs');
    const navigationReadvanced = await send(`/flow-interviews/${navigationStarted.data.interviewId}/next`, token, 'POST', {
      values: { FirstAnswer: 'remember me' }
    });
    assert.equal(navigationReadvanced.status, 202, JSON.stringify(navigationReadvanced.data));
    const navigationCompleted = await send(`/flow-interviews/${navigationStarted.data.interviewId}/next`, token, 'POST', {
      values: { SecondAnswer: 'done' }
    });
    assert.equal(navigationCompleted.status, 200, JSON.stringify(navigationCompleted.data));
    assert.equal(navigationCompleted.data.outputs.FlowInterviewGuid, navigationStarted.data.interviewId,
      '$Flow.InterviewGuid remains stable throughout a screen interview');
    assert.ok(Number.isFinite(Date.parse(navigationCompleted.data.outputs.FlowInterviewStartTime)),
      '$Flow.InterviewStartTime is exposed as a valid date/time');
    const navigationInterviewStartTime = Date.parse(navigationCompleted.data.outputs.FlowInterviewStartTime);
    assert.ok(navigationInterviewStartTime >= navigationStartedAt && navigationInterviewStartTime <= Date.now(),
      '$Flow.InterviewStartTime remains the start time of the original interview');

    const accountMetadata = await send('/metadata/objects/Account', token);
    assert.equal(accountMetadata.status, 200, JSON.stringify(accountMetadata.data));
    const chatterEnabledObject = {
      ...accountMetadata.data.object,
      settings: { ...accountMetadata.data.object.settings, allowInChatter: true }
    };
    const enabledChatter = await send('/metadata/objects/Account', token, 'PUT', chatterEnabledObject);
    assert.equal(enabledChatter.status, 200, JSON.stringify(enabledChatter.data));
    const chatterTarget = await send('/records/Account', token, 'POST', { Name: 'Flow Chatter Action Target' });
    assert.equal(chatterTarget.status, 201, JSON.stringify(chatterTarget.data));
    const chatterActionFlow = await send('/metadata/flows/Flow_Post_To_Chatter_Smoke', token, 'PUT', {
      apiName: 'Flow_Post_To_Chatter_Smoke', label: 'Flow Post to Chatter Smoke',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Action', label: 'Post to Account Feed', config: {
          actionType: 'Post to Chatter', objectApiName: 'Account',
          recordId: chatterTarget.data.record.Id, message: 'Flow notification for {!$User.Name}'
        } }
      ],
      connectors: [{ id: 'start-chatter-post', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(chatterActionFlow.status, 200, JSON.stringify(chatterActionFlow.data));
    const chatterActionRun = await send('/flows/Flow_Post_To_Chatter_Smoke/execute', token, 'POST', {});
    assert.equal(chatterActionRun.status, 200, JSON.stringify(chatterActionRun.data));
    const chatterFeed = await send(`/records/Account/${chatterTarget.data.record.Id}/chatter`, token);
    assert.equal(chatterFeed.status, 200, JSON.stringify(chatterFeed.data));
    assert.equal(chatterFeed.data.posts.at(-1).body, `Flow notification for ${login.data.user.name}`,
      'Post to Chatter resolves running-user references and stores a record-feed post');
    const invalidCustomNotificationFlow = {
      apiName: 'Flow_Custom_Notification_Invalid_Smoke', label: 'Flow Custom Notification Invalid Smoke',
      flowType: 'Autolaunched Flow', status: 'Draft', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Action', label: 'Incomplete notification', config: { actionType: 'Custom Notification' } }
      ],
      connectors: [{ id: 'start-invalid-notification', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    };
    const invalidCustomNotification = await send('/metadata/flows/Flow_Custom_Notification_Invalid_Smoke/validate', token, 'POST', invalidCustomNotificationFlow);
    assert.equal(invalidCustomNotification.status, 200, JSON.stringify(invalidCustomNotification.data));
    assert.ok(invalidCustomNotification.data.errors.some((error: string) => error.includes('requires at least one recipient')),
      JSON.stringify(invalidCustomNotification.data));
    assert.ok(invalidCustomNotification.data.errors.some((error: string) => error.includes('requires a title')),
      JSON.stringify(invalidCustomNotification.data));
    assert.ok(invalidCustomNotification.data.errors.some((error: string) => error.includes('requires a message')),
      JSON.stringify(invalidCustomNotification.data));
    assert.ok(invalidCustomNotification.data.errors.every((error: string) => !error.includes('Post to Chatter')),
      'Custom Notification validation must not fall through to Post to Chatter requirements');
    const customNotificationFlow = await send('/metadata/flows/Flow_Custom_Notification_Smoke', token, 'PUT', {
      apiName: 'Flow_Custom_Notification_Smoke', label: 'Flow Custom Notification Smoke',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Action', label: 'Notify running user', config: {
          actionType: 'Custom Notification', recipientIds: '{!$User.Id}',
          title: 'Flow test notification', messageBody: 'Hello {!$User.Name}'
        } }
      ],
      connectors: [{ id: 'start-notification', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    });
    assert.equal(customNotificationFlow.status, 200, JSON.stringify(customNotificationFlow.data));
    const sentCustomNotification = await send('/flows/Flow_Custom_Notification_Smoke/execute', token, 'POST', {});
    assert.equal(sentCustomNotification.status, 200, JSON.stringify(sentCustomNotification.data));
    const notificationInbox = await send('/notifications', token);
    assert.equal(notificationInbox.status, 200, JSON.stringify(notificationInbox.data));
    assert.equal(notificationInbox.data.unreadCount, 1);
    assert.equal(notificationInbox.data.notifications[0].title, 'Flow test notification');
    assert.equal(notificationInbox.data.notifications[0].body, `Hello ${login.data.user.name}`);
    const markedNotificationRead = await send(`/notifications/${notificationInbox.data.notifications[0].id}/read`, token, 'POST');
    assert.equal(markedNotificationRead.status, 200, JSON.stringify(markedNotificationRead.data));
    const readNotificationInbox = await send('/notifications', token);
    assert.equal(readNotificationInbox.data.unreadCount, 0,
      'users can read and mark their own Flow custom notifications as read');
    const approvalProcessesBefore = await send('/metadata/approval-processes', token);
    assert.equal(approvalProcessesBefore.status, 200, JSON.stringify(approvalProcessesBefore.data));
    const activeApprovalProcess = await send('/metadata/approval-processes/Account_Review_Smoke', token, 'PUT', {
      apiName: 'Account_Review_Smoke', label: 'Account Review Smoke', objectApiName: 'Account',
      approverUserIds: [login.data.user.id], active: true
    });
    assert.equal(activeApprovalProcess.status, 200, JSON.stringify(activeApprovalProcess.data));
    const duplicateApproverProcess = await send('/metadata/approval-processes/Duplicate_Approver_Smoke', token, 'PUT', {
      apiName: 'Duplicate_Approver_Smoke', label: 'Duplicate Approver Smoke', objectApiName: 'Account',
      approverUserIds: [login.data.user.id, login.data.user.id], active: true
    });
    assert.equal(duplicateApproverProcess.status, 400,
      'approval process metadata must reject duplicate approver assignments');
    const inactiveApprovalProcess = await send('/metadata/approval-processes/Inactive_Review_Smoke', token, 'PUT', {
      apiName: 'Inactive_Review_Smoke', label: 'Inactive Review Smoke', objectApiName: 'Account',
      approverUserIds: [login.data.user.id], active: false
    });
    assert.equal(inactiveApprovalProcess.status, 200, JSON.stringify(inactiveApprovalProcess.data));

    const approvalFlowDefinition = {
      apiName: 'Flow_Submit_Approval_Smoke', label: 'Flow Submit Approval Smoke',
      flowType: 'Autolaunched Flow', status: 'Draft', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Action', label: 'Submit Account for Approval', config: {
          actionType: 'Submit for Approval', approvalProcessApiName: 'Account_Review_Smoke',
          objectApiName: 'Account', recordId: chatterTarget.data.record.Id,
          comments: 'Please review this account.'
        } }
      ],
      connectors: [{ id: 'start-approval', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    };
    const inactiveProcessValidation = await send('/metadata/flows/Flow_Submit_Approval_Smoke/validate', token, 'POST', {
      ...approvalFlowDefinition,
      elements: approvalFlowDefinition.elements.map((element) => element.type === 'Action'
        ? { ...element, config: { ...element.config, approvalProcessApiName: 'Inactive_Review_Smoke' } }
        : element)
    });
    assert.ok(inactiveProcessValidation.data.errors.some((error: string) => /requires an active approval process/i.test(error)),
      JSON.stringify(inactiveProcessValidation.data));
    const mismatchedProcessValidation = await send('/metadata/flows/Flow_Submit_Approval_Smoke/validate', token, 'POST', {
      ...approvalFlowDefinition,
      elements: approvalFlowDefinition.elements.map((element) => element.type === 'Action'
        ? { ...element, config: { ...element.config, objectApiName: 'Contact' } }
        : element)
    });
    assert.ok(mismatchedProcessValidation.data.errors.some((error: string) => /is for "Account", not "Contact"/i.test(error)),
      JSON.stringify(mismatchedProcessValidation.data));

    const approvalFlow = await send('/metadata/flows/Flow_Submit_Approval_Smoke', token, 'PUT', {
      ...approvalFlowDefinition, status: 'Active'
    });
    assert.equal(approvalFlow.status, 200, JSON.stringify(approvalFlow.data));
    const deactivateReferencedApprovalProcess = await send(
      '/metadata/approval-processes/Account_Review_Smoke', token, 'PUT',
      {
        apiName: 'Account_Review_Smoke', label: 'Account Review Smoke', objectApiName: 'Account',
        approverUserIds: [login.data.user.id], active: false
      }
    );
    assert.equal(deactivateReferencedApprovalProcess.status, 409, JSON.stringify(deactivateReferencedApprovalProcess.data));
    const changeReferencedApprovalProcessObject = await send(
      '/metadata/approval-processes/Account_Review_Smoke', token, 'PUT',
      {
        apiName: 'Account_Review_Smoke', label: 'Account Review Smoke', objectApiName: 'Contact',
        approverUserIds: [login.data.user.id], active: true
      }
    );
    assert.equal(changeReferencedApprovalProcessObject.status, 409, JSON.stringify(changeReferencedApprovalProcessObject.data));
    const approvalProcessReferences = await send('/metadata/approval-processes/Account_Review_Smoke', token, 'DELETE');
    assert.equal(approvalProcessReferences.status, 409, JSON.stringify(approvalProcessReferences.data));
    const submittedApproval = await send('/flows/Flow_Submit_Approval_Smoke/execute', token, 'POST', {});
    assert.equal(submittedApproval.status, 200, JSON.stringify(submittedApproval.data));
    const approvalInbox = await send('/approvals/inbox', token);
    assert.equal(approvalInbox.status, 200, JSON.stringify(approvalInbox.data));
    assert.equal(approvalInbox.data.requests.length, 1);
    assert.equal(approvalInbox.data.requests[0].processApiName, 'Account_Review_Smoke');
    assert.equal(approvalInbox.data.requests[0].comments, 'Please review this account.');
    assert.equal(approvalInbox.data.requests[0].recordName, chatterTarget.data.record.Name);
    const approvalDecision = await send(`/approvals/${approvalInbox.data.requests[0].id}/decision`, token, 'POST', {
      decision: 'Approved', comments: 'Verified.'
    });
    assert.equal(approvalDecision.status, 200, JSON.stringify(approvalDecision.data));
    assert.equal(approvalDecision.data.request.status, 'Approved');
    const resolvedApprovalInbox = await send('/approvals/inbox', token);
    assert.deepEqual(resolvedApprovalInbox.data.requests, []);
    const deactivatedApprovalFlow = await send('/metadata/flows/Flow_Submit_Approval_Smoke/deactivate', token, 'POST');
    assert.equal(deactivatedApprovalFlow.status, 200, JSON.stringify(deactivatedApprovalFlow.data));
    const deactivateUnusedApprovalProcess = await send(
      '/metadata/approval-processes/Account_Review_Smoke', token, 'PUT',
      {
        apiName: 'Account_Review_Smoke', label: 'Account Review Smoke', objectApiName: 'Account',
        approverUserIds: [login.data.user.id], active: false
      }
    );
    assert.equal(deactivateUnusedApprovalProcess.status, 200, JSON.stringify(deactivateUnusedApprovalProcess.data));
    const deletedApprovalFlow = await send('/metadata/flows/Flow_Submit_Approval_Smoke', token, 'DELETE');
    assert.equal(deletedApprovalFlow.status, 204, JSON.stringify(deletedApprovalFlow.data));
    const deletedApprovalProcess = await send('/metadata/approval-processes/Account_Review_Smoke', token, 'DELETE');
    assert.equal(deletedApprovalProcess.status, 204, JSON.stringify(deletedApprovalProcess.data));
    const deletedInactiveApprovalProcess = await send('/metadata/approval-processes/Inactive_Review_Smoke', token, 'DELETE');
    assert.equal(deletedInactiveApprovalProcess.status, 204, JSON.stringify(deletedInactiveApprovalProcess.data));
    const restoredChatterObject = await send('/metadata/objects/Account', token, 'PUT', accountMetadata.data.object);
    assert.equal(restoredChatterObject.status, 200, JSON.stringify(restoredChatterObject.data));

    const defaultsDefinition = {
      apiName: 'Screen_Defaults_Smoke', label: 'Screen Defaults Smoke',
      description: 'Original version description', flowType: 'Screen Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null,
      startConfig: { launchContext: 'version-history-smoke' },
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Screen', label: 'Defaults', config: { fields: [
          { label: 'Required Topic', apiName: 'Topic', type: 'Picklist', required: true, choices: ['Sales'], defaultValue: 'Sales' },
          { label: 'Reference', apiName: 'Reference', type: 'Text', minLength: 3, maxLength: 6 },
          { label: 'Amount', apiName: 'Amount', type: 'Number', min: 10, max: 20 },
          { label: 'Date', apiName: 'StartDate', type: 'Date' },
          { label: 'Time', apiName: 'StartTime', type: 'Time' },
          { label: 'Date Time', apiName: 'StartDateTime', type: 'Date/Time' },
          { label: 'Email', apiName: 'Email', type: 'Email', defaultValue: 'flow@example.net' },
          { label: 'Website', apiName: 'Website', type: 'URL', defaultValue: 'https://example.net' }
        ] } }
      ],
      connectors: [{ id: 'start-screen', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [], versions: []
    };
    const defaultsFlow = await send('/metadata/flows/Screen_Defaults_Smoke', token, 'PUT', defaultsDefinition);
    assert.equal(defaultsFlow.status, 200, JSON.stringify(defaultsFlow.data));
    const invalidFormatDefault = await send('/metadata/flows/Screen_Defaults_Smoke/validate', token, 'POST', {
      ...defaultsDefinition,
      elements: defaultsDefinition.elements.map((element) => element.type === 'Screen'
        ? { ...element, config: { ...element.config, fields: element.config.fields.map((field) =>
          field.apiName === 'Email' ? { ...field, defaultValue: 'not-an-email' } : field) } }
        : element)
    });
    assert.ok(invalidFormatDefault.data.errors.some((error: string) => error.includes('email screen field')),
      JSON.stringify(invalidFormatDefault.data));
    const invalidBounds = await send('/metadata/flows/Screen_Defaults_Smoke/validate', token, 'POST', {
      ...defaultsDefinition,
      elements: defaultsDefinition.elements.map((element) => element.type === 'Screen'
        ? { ...element, config: { ...element.config, fields: element.config.fields.map((field: Record<string, any>) =>
          field.apiName === 'Reference' ? { ...field, minLength: 8, maxLength: 4 } : field) } }
        : element)
    });
    assert.equal(invalidBounds.status, 200, JSON.stringify(invalidBounds.data));
    assert.ok(invalidBounds.data.errors.some((error: string) => error.includes('Minimum length exceeds maximum length')),
      JSON.stringify(invalidBounds.data));
    const defaultsInterview = await send('/flows/Screen_Defaults_Smoke/execute', token, 'POST', {});
    assert.equal(defaultsInterview.status, 202, JSON.stringify(defaultsInterview.data));
    const blockedInterviewEdit = await send('/metadata/flows/Screen_Defaults_Smoke', token, 'PUT', {
      ...defaultsFlow.data.flow,
      status: 'Draft'
    });
    assert.equal(blockedInterviewEdit.status, 409,
      'an active flow with a pending screen interview cannot be edited into a new version');
    const blockedInterviewDeactivation = await send('/metadata/flows/Screen_Defaults_Smoke/deactivate', token, 'POST');
    assert.equal(blockedInterviewDeactivation.status, 409,
      'a flow with a pending screen interview cannot be deactivated');
    const blockedInterviewDelete = await send('/metadata/flows/Screen_Defaults_Smoke', token, 'DELETE');
    assert.equal(blockedInterviewDelete.status, 409,
      'a flow with a pending screen interview cannot be deleted');
    const invalidDate = await send(`/flow-interviews/${defaultsInterview.data.interviewId}/next`, token, 'POST', {
      values: { StartDate: '2025-02-29' }
    });
    assert.equal(invalidDate.status, 400, 'date fields reject impossible calendar dates');
    const invalidDateTime = await send(`/flow-interviews/${defaultsInterview.data.interviewId}/next`, token, 'POST', {
      values: { StartDateTime: 'not-a-date-time' }
    });
    assert.equal(invalidDateTime.status, 400, 'date/time fields reject invalid values');
    const impossibleDateTime = await send(`/flow-interviews/${defaultsInterview.data.interviewId}/next`, token, 'POST', {
      values: { StartDateTime: '2025-02-30T09:30' }
    });
    assert.equal(impossibleDateTime.status, 400, 'date/time fields reject impossible calendar dates');
    const invalidTime = await send(`/flow-interviews/${defaultsInterview.data.interviewId}/next`, token, 'POST', {
      values: { StartTime: '25:61' }
    });
    assert.equal(invalidTime.status, 400, 'time fields reject out-of-range clock values');
    const tooShort = await send(`/flow-interviews/${defaultsInterview.data.interviewId}/next`, token, 'POST', {
      values: { Reference: 'ab', Amount: 15 }
    });
    assert.equal(tooShort.status, 400, 'text fields enforce minimum length on the server');
    const amountTooLow = await send(`/flow-interviews/${defaultsInterview.data.interviewId}/next`, token, 'POST', {
      values: { Reference: 'abc', Amount: 9 }
    });
    assert.equal(amountTooLow.status, 400, 'numeric fields enforce minimum value on the server');
    const defaultsSubmitted = await send(`/flow-interviews/${defaultsInterview.data.interviewId}/next`, token, 'POST', {
      values: { Reference: 'abcd', Amount: 15, StartDate: '2024-02-29', StartTime: '09:45', StartDateTime: '2026-04-11T09:30' }
    });
    assert.equal(defaultsSubmitted.status, 200, 'valid date/time values and an omitted required field with a default are accepted');
    const editedDefaultsDefinition = {
      ...defaultsFlow.data.flow,
      description: 'Edited version description',
      startConfig: { launchContext: 'edited-version-history-smoke' }
    };
    const editedDefaultsFlow = await send('/metadata/flows/Screen_Defaults_Smoke', token, 'PUT', editedDefaultsDefinition);
    assert.equal(editedDefaultsFlow.status, 200, JSON.stringify(editedDefaultsFlow.data));
    assert.deepEqual(editedDefaultsFlow.data.flow.versions[0].startConfig,
      { launchContext: 'version-history-smoke' },
      'editing a flow preserves the previous version start configuration');
    assert.equal(editedDefaultsFlow.data.flow.versions[0].description, 'Original version description',
      'editing a flow preserves its previous description');
    assert.deepEqual(editedDefaultsFlow.data.flow.versions.at(-1).startConfig,
      { launchContext: 'edited-version-history-smoke' },
      'the active version snapshot preserves the edited start configuration');
    assert.equal(editedDefaultsFlow.data.flow.versions.at(-1).description, 'Edited version description');
    const deactivatedDefaultsFlow = await send('/metadata/flows/Screen_Defaults_Smoke/deactivate', token, 'POST');
    assert.equal(deactivatedDefaultsFlow.status, 200, JSON.stringify(deactivatedDefaultsFlow.data));
    const preservedActiveVersion = deactivatedDefaultsFlow.data.flow.versions.at(-1);
    assert.equal(preservedActiveVersion.label, 'Screen Defaults Smoke');
    assert.equal(preservedActiveVersion.description, 'Edited version description');
    assert.equal(preservedActiveVersion.flowType, 'Screen Flow');
    assert.equal(preservedActiveVersion.triggerObject, null);
    assert.deepEqual(preservedActiveVersion.startConfig, { launchContext: 'edited-version-history-smoke' },
      'deactivation history preserves the exact start configuration of the active version');
    assert.equal(deactivatedDefaultsFlow.data.flow.versions.filter((version: Record<string, unknown>) =>
      version.versionNumber === preservedActiveVersion.versionNumber).length, 1,
    'deactivation must not create a duplicate history entry for the active version');
    const priorDefaultsVersion = editedDefaultsFlow.data.flow.versions[0];
    const restoredDefaultsVersion = await send('/metadata/flows/Screen_Defaults_Smoke', token, 'PUT', {
      ...deactivatedDefaultsFlow.data.flow,
      label: priorDefaultsVersion.label,
      description: priorDefaultsVersion.description,
      flowType: priorDefaultsVersion.flowType,
      triggerObject: priorDefaultsVersion.triggerObject,
      startConfig: priorDefaultsVersion.startConfig,
      elements: priorDefaultsVersion.elements,
      connectors: priorDefaultsVersion.connectors,
      resources: priorDefaultsVersion.resources,
      status: 'Draft',
      activeVersion: null
    });
    assert.equal(restoredDefaultsVersion.status, 200, JSON.stringify(restoredDefaultsVersion.data));
    assert.equal(restoredDefaultsVersion.data.flow.status, 'Draft');
    assert.equal(restoredDefaultsVersion.data.flow.versionNumber, deactivatedDefaultsFlow.data.flow.versionNumber + 1);
    assert.equal(restoredDefaultsVersion.data.flow.description, 'Original version description');
    assert.deepEqual(restoredDefaultsVersion.data.flow.startConfig, { launchContext: 'version-history-smoke' });
    assert.equal(restoredDefaultsVersion.data.flow.versions.length, deactivatedDefaultsFlow.data.flow.versions.length + 1,
      'restoring a historical definition creates a new version without discarding history');

    const failingFlow = await send('/metadata/flows/Failed_Execution_Smoke', token, 'PUT', {
      apiName: 'Failed_Execution_Smoke', label: 'Failed Execution Smoke', flowType: 'Autolaunched Flow',
      status: 'Active', versionNumber: 1, activeVersion: null, triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Assignment', label: 'Divide by zero', config: { variable: 'counter', operator: 'Divide', value: 0 } }
      ],
      connectors: [{ id: 'start-to-error', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [{
        name: 'counter', label: 'Counter', type: 'Variable', dataType: 'Number',
        isCollection: false, availableForInput: false, availableForOutput: false, value: 1
      }],
      versions: []
    });
    assert.equal(failingFlow.status, 200, JSON.stringify(failingFlow.data));
    const failedExecution = await send('/flows/Failed_Execution_Smoke/execute', token, 'POST', {});
    assert.equal(failedExecution.status, 422, 'an unhandled runtime error should fail the flow execution');
    const flowLogs = await send('/metadata/flow-logs', token);
    assert.equal(flowLogs.status, 200, JSON.stringify(flowLogs.data));
    const failedExecutionLog = flowLogs.data.logs.find((log: Record<string, unknown>) =>
      log.flowApiName === 'Failed_Execution_Smoke');
    assert.ok(failedExecutionLog, 'failed flow execution should be persisted as a log');
    assert.equal(failedExecutionLog.trigger, 'Manual');
    assert.match(String(failedExecutionLog.error), /cannot divide by zero/i);
    assert.ok(flowLogs.data.logs.some((log: Record<string, unknown>) =>
      log.flowApiName === 'Contact_Transaction_Rollback_Smoke' && log.trigger === 'Record-Triggered'),
    'the failed record-triggered flow must remain diagnosable after transaction rollback');
    const subflowChild = await send('/metadata/flows/Subflow_Child_Mapping_Smoke', token, 'PUT', {
      apiName: 'Subflow_Child_Mapping_Smoke', label: 'Subflow Child Mapping Smoke',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [{ id: 1, type: 'Start', label: 'Start', config: {} }],
      connectors: [],
      resources: [{
        name: 'ChildValue', label: 'Child Value', type: 'Variable', dataType: 'Text',
        isCollection: false, availableForInput: true, availableForOutput: true, value: 'default'
      }],
      versions: []
    });
    assert.equal(subflowChild.status, 200, JSON.stringify(subflowChild.data));
    const subflowParentDefinition = {
      apiName: 'Subflow_Parent_Mapping_Smoke', label: 'Subflow Parent Mapping Smoke',
      flowType: 'Autolaunched Flow', status: 'Active', versionNumber: 1, activeVersion: null,
      triggerObject: null, startConfig: {},
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Subflow', label: 'Call Child', config: {
          flowApiName: 'Subflow_Child_Mapping_Smoke',
          inputValues: 'ChildValue={!ParentInput}',
          outputValues: 'ChildValue=ParentOutput'
        } }
      ],
      connectors: [{ id: 'start-child-map', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [
        { name: 'ParentInput', label: 'Parent Input', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: true, availableForOutput: false },
        { name: 'ParentOutput', label: 'Parent Output', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: false, availableForOutput: true }
      ],
      versions: []
    };
    const subflowParent = await send('/metadata/flows/Subflow_Parent_Mapping_Smoke', token, 'PUT', subflowParentDefinition);
    assert.equal(subflowParent.status, 200, JSON.stringify(subflowParent.data));
    const mappedSubflowRun = await send('/flows/Subflow_Parent_Mapping_Smoke/execute', token, 'POST', { ParentInput: 'mapped-child-result' });
    assert.equal(mappedSubflowRun.status, 200, JSON.stringify(mappedSubflowRun.data));
    assert.equal(mappedSubflowRun.data.outputs.ParentOutput, 'mapped-child-result',
      'Subflow input and output mappings transfer values between differently named parent and child resources');
    const invalidSubflowMapping = await send('/metadata/flows/Subflow_Parent_Mapping_Smoke/validate', token, 'POST', {
      ...subflowParentDefinition,
      elements: subflowParentDefinition.elements.map((element) => element.type === 'Subflow'
        ? { ...element, config: { ...element.config, outputValues: 'UnavailableOutput=ParentOutput' } }
        : element)
    });
    assert.ok(invalidSubflowMapping.data.errors.some((error: string) => error.includes('UnavailableOutput')),
      JSON.stringify(invalidSubflowMapping.data));
    const blockedSubflowChildDeactivation = await send('/metadata/flows/Subflow_Child_Mapping_Smoke/deactivate', token, 'POST');
    assert.equal(blockedSubflowChildDeactivation.status, 409,
      'an active child flow cannot be deactivated while an active parent references it');
    const deactivatedSubflowParent = await send('/metadata/flows/Subflow_Parent_Mapping_Smoke/deactivate', token, 'POST');
    assert.equal(deactivatedSubflowParent.status, 200, JSON.stringify(deactivatedSubflowParent.data));
    assert.equal((await send('/metadata/flows/Subflow_Child_Mapping_Smoke/deactivate', token, 'POST')).status, 200,
      'the child flow can be deactivated after its referencing parent is inactive');
    const subflowReference = {
      ...failingFlow.data.flow,
      apiName: 'Subflow_Reference_Smoke',
      label: 'Subflow Reference Smoke',
      status: 'Draft',
      versionNumber: 1,
      activeVersion: null,
      elements: [
        { id: 1, type: 'Start', label: 'Start', config: {} },
        { id: 2, type: 'Subflow', label: 'Call Child Flow', config: { flowApiName: 'Failed_Execution_Smoke' } }
      ],
      connectors: [{ id: 'start-child', from: 1, to: 2, label: '', kind: 'normal' }],
      resources: [],
      versions: []
    };
    const savedSubflowReference = await send('/metadata/flows/Subflow_Reference_Smoke', token, 'PUT', subflowReference);
    assert.equal(savedSubflowReference.status, 200, JSON.stringify(savedSubflowReference.data));
    const blockedFlowDelete = await send('/metadata/flows/Failed_Execution_Smoke', token, 'DELETE');
    assert.equal(blockedFlowDelete.status, 409, 'referenced subflows must prevent deleting their child flow');
    const deactivatedFlow = await send('/metadata/flows/Failed_Execution_Smoke/deactivate', token, 'POST');
    assert.equal(deactivatedFlow.status, 200, JSON.stringify(deactivatedFlow.data));
    assert.equal(deactivatedFlow.data.flow.status, 'Draft');
    assert.equal(deactivatedFlow.data.flow.activeVersion, null);
    assert.equal(deactivatedFlow.data.flow.versionNumber, failingFlow.data.flow.versionNumber + 1);
    assert.equal(deactivatedFlow.data.flow.versions.at(-1).status, 'Active');
    assert.equal((await send('/metadata/flows/Failed_Execution_Smoke/deactivate', token, 'POST')).status, 409,
      'deactivating an already inactive flow must return a conflict');
    assert.equal((await send('/metadata/flows/Subflow_Reference_Smoke', token, 'DELETE')).status, 204);
    assert.equal((await send('/metadata/flows/Failed_Execution_Smoke', token, 'DELETE')).status, 204,
      'a deactivated, unreferenced flow can be deleted');
    assert.equal((await send('/metadata/flows', token)).data.flows.some((flow: Record<string, unknown>) =>
      flow.apiName === 'Failed_Execution_Smoke'), false, 'deleted flow metadata must no longer be listed');
  } finally {
    if (child) await stopApi(child);
    await rm(directory, { recursive: true, force: true });
  }
});
