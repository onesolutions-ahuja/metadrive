import assert from 'node:assert/strict';
import test from 'node:test';
import {
  repairWhatsappRouterMetadata,
  publishRepairedWhatsappVersion
} from '../src/whatsapp-flow-metadata.mjs';

const legacy = () => ({
  apiName: 'WA_ROUTER', label: 'WhatsApp Router',
  description: 'Editable routing', flowType: 'Record-Triggered Flow',
  triggerObject: 'Communication_Records__c',
  startConfig: { trigger: 'created', runWhen: 'after-save' },
  status: 'Active', versionNumber: 21, activeVersion: 21,
  elements: [
    { id: 1, label: 'Start', type: 'Start', config: {} },
    { id: 8, label: 'Send WhatsApp Reply', type: 'HTTP Callout', config: { onError: 'FAULT_PATH' } },
    { id: 9, label: 'Log Outgoing WhatsApp Message', type: 'Create Records', config: {
      object: 'Communication_Records__c', fieldValues: [{ field: 'Direction__c', value: 'Outgoing' }]
    } },
    { id: 10, label: 'Mark Incoming Message Processed', type: 'Update Records', config: {
      object: 'Communication_Records__c', fieldValues: [{ field: 'Status__c', value: 'Processed' }]
    } },
    { id: 11, label: 'Capture Callout Error', type: 'Assignment', config: {
      variable: 'FlowError', operator: 'Assign', value: '{!$Flow.FaultMessage}'
    } }
  ],
  connectors: [{ id: 'outbound-fault', from: 8, to: 11, kind: 'fault', label: '' }],
  resources: [], versions: [
    { versionNumber: 20, status: 'Active', savedAt: '2026-10-10T12:00:00.000Z', elements: [], connectors: [], resources: [] },
    { versionNumber: 21, status: 'Active', savedAt: '2026-10-10T13:00:00.000Z', elements: [], connectors: [], resources: [] },
    { versionNumber: 21, status: 'Active', savedAt: '2026-10-10T13:01:00.000Z', elements: [], connectors: [], resources: [] }
  ]
});

test('legacy WhatsApp metadata repair is safe, idempotent and preserves user messages', () => {
  const source = legacy();
  const input = structuredClone(source);
  const repaired = repairWhatsappRouterMetadata(input);
  assert.equal(repaired.changes.length, 5);
  assert.deepEqual(source, legacy(), 'original metadata remains unchanged');
  const mark = repaired.flow.elements.find((element) => element.id === 10);
  assert.equal(mark.config.fieldValues[0].value, 'Completed');
  const outgoing = repaired.flow.elements.find((element) => element.id === 9);
  assert.deepEqual(outgoing.config.fieldValues.slice(1), [
    { field: 'Event_Type__c', value: 'Message' },
    { field: 'Communication_Mode__c', value: 'WhatsApp' },
    { field: 'Source__c', value: 'Flow' }
  ]);
  const fault = repaired.flow.elements.find((element) => element.label === 'Record WhatsApp Delivery Failure');
  assert.ok(fault);
  assert.equal(fault.config.fieldValues[0].value, 'Failed');
  assert.ok(repaired.flow.connectors.some((edge) => edge.from === 11 && edge.to === fault.id));
  const again = repairWhatsappRouterMetadata(repaired.flow);
  assert.deepEqual(again.changes, [], 'repair must not create duplicate nodes or further versions');

  const published = publishRepairedWhatsappVersion(source, repaired.flow, '2026-10-11T17:00:00.000Z');
  assert.equal(published.activeVersion, 22);
  assert.equal(published.versions.filter((version) => version.status === 'Active').length, 1);
  assert.equal(published.versions.find((version) => version.versionNumber === 21).status, 'Obsolete');
  assert.equal(new Set(published.versions.map((version) => version.versionNumber)).size, published.versions.length);
});

test('do not change unrelated/customised flow configurations', () => {
  assert.deepEqual(repairWhatsappRouterMetadata({ ...legacy(), apiName: 'CUSTOM_ROUTER' }).changes, []);
  const customised = legacy();
  customised.elements[3].config.fieldValues[0].value = 'Completed';
  customised.elements[2].config.fieldValues.push({ field: 'Source__c', value: 'Other' });
  const repaired = repairWhatsappRouterMetadata(customised);
  assert.equal(repaired.flow.elements[3].config.fieldValues[0].value, 'Completed');
  assert.equal(repaired.flow.elements[2].config.fieldValues.find((item) => item.field === 'Source__c').value, 'Other');
});

test('WhatsApp repair refuses legacy JSONB and JSONB-backed relational persistence', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const script = fileURLToPath(new URL('../scripts/repair-whatsapp-router.mjs', import.meta.url));
  for (const mode of ['jsonb', 'relational']) {
    const result = spawnSync(process.execPath, [script], {
      env: { ...process.env, METADRIVE_PERSISTENCE_MODE: mode,
        METADRIVE_WHATSAPP_REPAIR_TENANT_ID: 'test-tenant' },
      encoding: 'utf8', timeout: 10000
    });
    assert.notEqual(result.status, 0, 'unsafe persistence mode must not be accepted');
    assert.match(result.stderr, /SQL-only normalized mode is required/);
  }
});
