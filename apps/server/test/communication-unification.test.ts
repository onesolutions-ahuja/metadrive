import assert from 'node:assert/strict';
import test from 'node:test';
import { migrateLegacyWhatsappRecords, migrateLegacyWhatsappFlow, addStarterBeautyAlias } from '../src/communication-unification.js';

test('unifies messages and API audit records idempotently without deleting history', () => {
  const records: Record<string, Record<string, unknown>[]> = {
    WhatsApp_Message__c: [{ Id: 'msg-1', Name: 'WAM-000001', Direction__c: 'Incoming',
      Message_Body__c: 'BARBER', Provider_Message_Id__c: 'provider-id',
      CreatedDate: '2026-10-10T12:00:00.000Z' }],
    Communication_Records__c: [{ Id: 'api-1', Status_Code__c: 200 }]
  };
  const migrated = migrateLegacyWhatsappRecords(records);
  assert.equal(migrated.WhatsApp_Message__c.length, 1);
  assert.equal(migrated.Communication_Records__c.length, 2);
  assert.equal(migrated.Communication_Records__c.find(row => row.Id === 'msg-1')?.Communication_Mode__c, 'WhatsApp');
  assert.equal(migrated.Communication_Records__c.find(row => row.Id === 'msg-1')?.Provider_Message_Id__c, 'provider-id');
  assert.equal(migrated.Communication_Records__c.find(row => row.Id === 'api-1')?.Event_Type__c, 'API Call');
  assert.deepEqual(migrateLegacyWhatsappRecords(migrated), migrated);
});

test('existing WhatsApp flow and versions retarget records and preserve OR conditions', () => {
  const flow = {
    triggerObject: 'WhatsApp_Message__c',
    startConfig: { trigger: 'created', conditionLogic: 'Any',
      entryConditions: [
        { field: 'Message_Body__c', operator: 'Starts With', value: 'BARBER' },
        { field: 'Message_Body__c', operator: 'Starts With', value: 'ROOF' }
      ] },
    elements: [{ config: { object: 'WhatsApp_Message__c', fieldValues: [{ field: 'Status__c', value: 'Sent' }] } }],
    versions: [{ triggerObject: 'WhatsApp_Message__c',
      startConfig: { entryConditions: [{ field: 'Direction__c', operator: 'Equals', value: 'Incoming' }] },
      elements: [{ config: { object: 'WhatsApp_Message__c' } }] }]
  };
  const changed = migrateLegacyWhatsappFlow(flow);
  assert.equal(changed.triggerObject, 'Communication_Records__c');
  assert.equal(changed.startConfig.entryConditions.length, 5);
  assert.equal(changed.startConfig.conditionLogic, '(1 OR 2) AND 3 AND 4 AND 5');
  assert.equal(changed.elements[0].config.object, 'Communication_Records__c');
  assert.deepEqual(changed.elements[0].config.fieldValues, flow.elements[0].config.fieldValues);
  assert.equal(changed.versions[0].triggerObject, 'Communication_Records__c');
  assert.equal(changed.versions[0].elements[0].config.object, 'Communication_Records__c');
  assert.deepEqual(migrateLegacyWhatsappFlow(changed), changed);
});

test('conditionless legacy flows require every message origin filter', () => {
  const flow = { triggerObject: 'WhatsApp_Message__c',
    startConfig: { conditionLogic: 'Any', entryConditions: [] as Array<Record<string, unknown>> },
    elements: [{ config: {} as Record<string, unknown> }], versions: [] };
  const changed = migrateLegacyWhatsappFlow(flow);
  assert.equal(changed.startConfig.conditionLogic, 'All');
  assert.equal(changed.startConfig.entryConditions.length, 3);
  assert.equal(changed.startConfig.entryConditions[0].field, 'Event_Type__c');
  assert.equal(changed.startConfig.entryConditions[1].field, 'Communication_Mode__c');
  assert.equal(changed.startConfig.entryConditions[2].field, 'Source__c');
});

test('upgrades only the unchanged editable starter Beauty keyword; preserves custom decisions', () => {
  const original = {
    apiName: 'WA_ROUTER',
    elements: [
      { type: 'Start', label: 'Start', config: {} as Record<string, unknown> },
      { type: 'Decision', label: 'Route by Keyword',
        config: { outcomes: [{ name: 'Beauty', label: 'Beauty',
          conditions: [{ field: 'Message_Body__c', operator: 'Starts With', value: 'BARBER' }] }] } }
    ]
  };
  const updated = addStarterBeautyAlias(original);
  const outcome = (updated.elements[1].config.outcomes as Array<Record<string, any>>)[0];
  assert.equal(outcome.conditionLogic, 'Any');
  assert.deepEqual(outcome.conditions.map((item: {value: string}) => item.value), ['BARBER', 'BEAUTY']);
  assert.deepEqual(addStarterBeautyAlias(updated), updated);
  const custom = structuredClone(original);
  (custom.elements[1].config.outcomes as Array<Record<string, any>>)[0].conditions[0].value = 'SALON';
  assert.deepEqual(addStarterBeautyAlias(custom), custom);
});
