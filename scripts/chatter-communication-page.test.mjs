import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const root=new URL('../apps/web/src/',import.meta.url);
const preset=JSON.parse(readFileSync(new URL('page-presets/chatter.editable.json',root),'utf8'));
const manifest=JSON.parse(readFileSync(new URL('custom-components/manifest.json',root),'utf8'));
const catalog=JSON.parse(readFileSync(new URL('../apps/server/data/installable-app-packages.json',import.meta.url),'utf8'));
const pkg=catalog.packages.find(p=>p.appKey==='whatsapp');

test('Chatter is editable under the Communication app, not a replacement record page',()=>{
  assert.equal(preset.pageType,'App Page');
  assert.equal(preset.layoutMode,'template');
  assert.equal(preset.targetObject,'Communication_Records__c');
  assert.deepEqual(preset.devices,['Desktop','Phone']);
  assert.equal(preset.status,'Draft','Activate only after server-side grants and tested Flows');
  assert.deepEqual(pkg.pages.find(p=>p.apiName===preset.apiName),preset);
  const app=pkg.apps.find(a=>a.apiName==='Communication');
  assert.ok(app.navigationItems.includes('Communication_Records__c'));
  assert.ok(app.navigationPageApiNames.includes('UNE_CHATTER'));
  for(const c of preset.components) assert.ok(manifest.some(m=>'Custom:'+m.apiName===c.type));
  const inbox=preset.components.find(c=>c.type==='Custom:ChatterInbox');
  assert.ok(inbox);
  assert.equal(inbox.properties.messagesObjectApiName,'Communication_Records__c');
  assert.equal(inbox.properties.actionFlows.send.flowApiName,'CHATTER_SEND_MESSAGE');
  assert.equal(inbox.properties.actionFlows.assign.flowApiName,'CHATTER_ASSIGN_CONVERSATION');
});

test('app package includes independent grants, trusted channels, and editable Flows',()=>{
  assert.deepEqual(pkg.objects.map(o=>o.apiName).sort(),['Chatter_Channel_Account__c','Chatter_Channel_Grant__c']);
  assert.ok(pkg.extendObjects.find(o=>o.apiName==='Communication_Records__c').fields
    .some(f=>f.apiName==='Channel_Account__c'));
  assert.ok(pkg.flows.some(f=>f.apiName==='CHATTER_SEND_MESSAGE'&&f.elements.some(e=>e.type==='HTTP Callout'&&e.config.namedCredentialResource)));
  assert.ok(pkg.flows.some(f=>f.apiName==='CHATTER_ASSIGN_CONVERSATION'&&f.elements.some(e=>e.type==='Update Records')));
  assert.ok(pkg.flows.every(f=>f.status==='Draft'),'Never publish unbound messaging Flows');
});
