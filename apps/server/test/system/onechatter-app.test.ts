import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seedOneChatterAppCatalog,ONECHATTER_APP} from '../../src/app-seeders/onechatter-app-catalog.js';
import {seedOneChatterInstalledPage} from '../../src/app-seeders/onechatter-page.js';
import {presentPageRecords} from '../../../web/src/core/records/RecordWorkspace/recordPresentationAdapters.js';
import {bindPageStateProperties,safePageStateRecordCollection} from '../../../web/src/core/pages/PageRuntime/pageComponentBindings.js';

const tenant='tenant-a';
function fakeClient(mode:'new'|'existing'|'uninstalled'){
  const calls:Array<{sql:string;params:unknown[]}>=[];
  const client={query:async(sql:string,params:unknown[]=[])=>{
    calls.push({sql,params});
    if(sql.includes('SELECT a.id FROM md_apps')||sql.includes('SELECT id FROM md_apps'))return {rows:mode==='uninstalled'?[]:[{id:'app-a'}]};
    if(sql.includes('SELECT version FROM md_app_package_versions'))return {rows:[{version:ONECHATTER_APP.version}]};
    if(sql.includes('INSERT INTO md_page_definitions'))return {rows:mode==='existing'?[]:[{id:'page-a'}]};
    if(sql.includes('SELECT id FROM md_page_definitions'))return {rows:[{id:'page-a'}]};
    if(sql.includes('SELECT DISTINCT api_name')&&sql.includes('md_flow_definitions'))
      return {rows:['AceChatterSendMessage','AceChatterCreateConversation',
        'AceChatterFindConversationByPhone','AceChatterLoadContacts'].map(api_name=>({api_name}))};
    if(sql.includes('SELECT api_name')&&sql.includes('md_component_definitions'))
      return {rows:[{api_name:params[1]}]};
    if(sql.includes('SELECT EXISTS('))return {rows:[{allowed:true}]};
    return {rows:[],rowCount:1};
  }};
  return {client,calls};
}
test('OneChatter catalog is discoverable without installation, tenant records or permission assignments',async()=>{
  const {client,calls}=fakeClient('new');
  await seedOneChatterAppCatalog({transaction:async(fn:(client:unknown)=>Promise<void>)=>fn(client)} as never);
  assert.equal(ONECHATTER_APP.apiName,'OneChatter');
  assert.ok(calls.some(x=>x.sql.includes('md_app_package_versions')));
  assert.equal(calls.some(x=>/md_app_installations|md_permission_assignments|md_records/.test(x.sql)),false);
});
test('OneChatter installation creates a new editable metadata page, reuses existing Flows and touches no AceChatter metadata',async()=>{
  const {client,calls}=fakeClient('new');
  assert.equal(await seedOneChatterInstalledPage(client as never,tenant),true);
  assert.equal(calls.filter(x=>x.sql.includes('INSERT INTO md_lightning_page_nodes')).length,2);
  assert.equal(calls.filter(x=>x.sql.includes('INSERT INTO md_app_home_pages')).length,3);
  assert.ok(calls.some(x=>x.params.includes('Custom:OneConversation')));
  assert.ok(calls.some(x=>x.params.includes('Custom:OneText')));
  assert.ok(calls.some(x=>x.sql.includes('md_lightning_page_details')&&x.sql.includes("'Active'")));
  assert.ok(calls.some(x=>x.params.includes('AceChatterSendMessage')));
  assert.ok(!calls.some(x=>/UPDATE |DELETE |INSERT INTO md_flow_definitions|INSERT INTO md_record_values|INSERT INTO md_app_seed_pages/.test(x.sql)));
  assert.ok(calls.filter(x=>x.sql.includes('md_lightning_page_node_properties'))
    .some(x=>x.params.includes('/props/actionFlows/send/flowApiName')));
  assert.ok(calls.some(x=>x.params.includes('/props/actionFlows/start/flowApiName')
    &&x.params.includes('AceChatterLoadContacts')));
  assert.ok(calls.some(x=>x.params.includes('/props/stateBindings/contactChoices')
    &&x.params.includes('oneChatterContacts')));
  assert.ok(calls.some(x=>x.params.includes('/props/contactChoices')));
});
test('reinstall preserves a customised Page Builder page without replacing its nodes or properties',async()=>{
  const {client,calls}=fakeClient('existing');
  assert.equal(await seedOneChatterInstalledPage(client as never,tenant),true);
  assert.ok(!calls.some(x=>/INSERT INTO md_lightning_page_nodes|INSERT INTO md_lightning_page_node_properties|UPDATE md_lightning_page_details|DELETE /.test(x.sql)));
});
test('not installing the app cannot seed any tenant OneChatter page',async()=>{
  const {client,calls}=fakeClient('uninstalled');
  assert.equal(await seedOneChatterInstalledPage(client as never,tenant),false);
  assert.equal(calls.length,2);
});
test('safe Flow record collections populate declared component properties only',()=>{
  const inputs={contactChoices:[],stateBindings:{contactChoices:'authorizedContacts',
    records:'authorizedContacts'}};
  const rows=[{Id:'contact-1',Name:'Customer',Phone:'447700900321'}];
  assert.deepEqual(safePageStateRecordCollection(rows),rows);
  assert.deepEqual(bindPageStateProperties(inputs,
    {authorizedContacts:JSON.stringify(rows)}).contactChoices,rows);
  assert.deepEqual(bindPageStateProperties(inputs,
    {authorizedContacts:rows}).records,undefined);
  assert.equal(safePageStateRecordCollection([{Id:'c',constructor:'oops'}]),undefined);
  assert.equal(safePageStateRecordCollection(Array(201).fill({Name:'excess'})),undefined);
});

test('shared OneConversation maps tenant-RBAC-filtered Communication rows using component properties',()=>{
  const properties={
    conversationAccessMode:'recordPermissions',conversationDefaultAccount:'WhatsApp',
    conversationDirectionFieldApiName:'Direction',conversationAccountFieldApiName:'Channel',
    conversationFromFieldApiName:'Sender',conversationToFieldApiName:'Recipient',
    conversationOccurredFieldApiName:'ReceivedAt',conversationOutgoingOccurredFieldApiName:'SentAt',
    conversationBodyFieldApiName:'Body',conversationContactNameFieldApiName:'Sender',
    conversationNormalizePhoneNumbers:true,conversationNameFromParticipant:true,
    conversationIncomingValue:'Inbound',conversationOutgoingValue:'Outbound',sendEnabled:false
  };
  const model=presentPageRecords('ConversationThread',[
    {Id:'message-1',Direction:'Inbound',Channel:'WhatsApp',Sender:'Alice (447700900321)',
      Recipient:'company',ReceivedAt:'2026-10-23T12:00:00Z',Body:'Hello'},
    {Id:'message-2',Direction:'Outbound',Channel:'WhatsApp',Sender:'company',
      Recipient:'+44 7700 900321',SentAt:'2026-10-23T12:01:00Z',Body:'Hi'}
  ],{grants:[],userId:'user',viewAll:false},properties) as {
    conversations:Array<{phoneNumber:string;contactName:string;canSend:boolean}>;
    messages:Array<{body:string;sentAt:string}>;canSend:boolean
  };
  assert.equal(model.conversations.length,1);
  assert.equal(model.conversations[0].phoneNumber,'447700900321');
  assert.equal(model.conversations[0].contactName,'Alice');
  assert.equal(model.canSend,false);
  assert.deepEqual(model.messages.map(x=>x.body),['Hello','Hi']);
  assert.equal(model.messages[1].sentAt,'2026-10-23T12:01:00Z');
});
