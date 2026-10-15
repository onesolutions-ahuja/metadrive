import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const preset=JSON.parse(readFileSync(new URL('../apps/web/src/page-presets/chatter.editable.json',import.meta.url),'utf8'));
const manifest=JSON.parse(readFileSync(new URL('../apps/web/src/custom-components/manifest.json',import.meta.url),'utf8'));
const catalog=JSON.parse(readFileSync(new URL('../apps/server/data/installable-app-packages.json',import.meta.url),'utf8'));
const pkg=catalog.packages.find(p=>p.appKey==='whatsapp');

test('Chatter uses the installed Communication record page and published component',()=>{
  assert.ok(pkg,'WhatsApp installer must register Chatter');
  assert.equal(preset.pageType,'Record Page');
  assert.equal(preset.targetObject,'Communication_Records__c');
  assert.deepEqual(preset.devices,['Desktop','Phone']);
  assert.deepEqual(pkg.pages.find(p=>p.apiName===preset.apiName),preset);
  assert.ok(preset.activationAssignments.some(a=>a.scope==='Org Default'
    && a.formFactors.includes('Desktop')&&a.formFactors.includes('Phone')));
  for(const c of preset.components)
    assert.ok(manifest.some(m=>'Custom:'+m.apiName===c.type),'Unregistered component: '+c.type);
  const inbox=preset.components.find(c=>c.type==='Custom:ChatterInbox');
  assert.ok(inbox,'ChatterInbox must remain individually editable');
  assert.equal(inbox.properties.messagesObjectApiName,'Communication_Records__c');
  assert.equal(inbox.properties.actionFlows.send.flowApiName,'CHATTER_SEND_MESSAGE');
  assert.equal(inbox.properties.actionFlows.assign.flowApiName,'CHATTER_ASSIGN_CONVERSATION');
});

test('Chatter install package seeds channel grants and published metadata Flows',()=>{
  assert.ok(pkg.objects.some(o=>o.apiName==='Chatter_Channel_Grant__c'));
  assert.ok(pkg.extendObjects.some(o=>o.apiName==='Communication_Records__c'
    && o.fields.some(f=>f.apiName==='Channel_Account__c')));
  const seed=pkg.installation.credentialGrantSeeds.find(s=>s.objectApiName==='Chatter_Channel_Grant__c');
  assert.ok(seed,'Trusted Named Credential-derived grant seeder is mandatory');
  assert.equal(seed.credentialHost,'graph.facebook.com');
  assert.ok(seed.uniqueBy.includes('Channel_Account__c'));
  assert.ok(pkg.flows.some(f=>f.apiName==='CHATTER_SEND_MESSAGE'&&f.status==='Active'
    && f.elements.some(e=>e.type==='HTTP Callout'&&e.config.namedCredentialResource)));
  assert.ok(pkg.flows.some(f=>f.apiName==='CHATTER_ASSIGN_CONVERSATION'&&f.status==='Active'
    && f.elements.some(e=>e.type==='Update Records')));
  assert.equal(pkg.profile.objectPermissions.Communication_Records__c.delete,false);
});
