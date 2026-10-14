import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root = new URL('../apps/web/src/', import.meta.url);
const preset = JSON.parse(readFileSync(new URL('page-presets/chatter.editable.json', root),'utf8'));
const manifest = JSON.parse(readFileSync(new URL('custom-components/manifest.json', root),'utf8'));

test('Chatter is an editable Communication record page on desktop and phone', () => {
  assert.equal(preset.pageType,'Record Page');
  assert.equal(preset.targetObject,'Communication_Records__c');
  assert.deepEqual(preset.devices,['Desktop','Phone']);
  assert.ok(preset.activationAssignments.some(a => a.scope === 'Org Default'
    && a.formFactors.includes('Desktop') && a.formFactors.includes('Phone')));
  assert.equal(preset.status,'Draft','Page must not be active until server-side access and send Flows are published');
  for(const c of preset.components){
    assert.ok(manifest.some(m => 'Custom:'+m.apiName === c.type),'Unregistered component '+c.type);
  }
  const inbox = preset.components.find(c=>c.type==='Custom:ChatterInbox');
  assert.ok(inbox);
  assert.equal(inbox.properties.messagesObjectApiName,'Communication_Records__c');
  assert.equal(inbox.properties.conversationsObjectApiName,'Communication_Records__c');
  assert.equal(inbox.properties.actionFlows.send.flowApiName,'CHATTER_SEND_MESSAGE');
  assert.equal(inbox.properties.actionFlows.assign.flowApiName,'CHATTER_ASSIGN_CONVERSATION');
});
