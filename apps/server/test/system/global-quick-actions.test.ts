import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GlobalQuickActionMetadataService} from '../../src/system-support/global-quick-action-metadata.js';
import {ObjectQuickActionRuntime} from '../../src/system-support/object-quick-action-runtime.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {RecordEngine} from '../../src/system-files/record-engine.js';
import type {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import type {RecordCollaborationService} from '../../src/system-support/record-collaboration-service.js';
import type {NamedCredentialService} from '../../src/system-support/named-credential-service.js';
const t='00000000-0000-4000-8000-000000000001',u='00000000-0000-4000-8000-000000000002';
const credential='00000000-0000-4000-8000-000000000011';
const actor={tenant_id:t,user_id:u};
const sample=[{id:'CreateTicket',label:'Create Ticket',enabled:true,
 behavior:'Create Record',targetObjectApi:'Ticket__c'}];

test('Global Quick Action metadata stores tenant-scoped forms and rejects unsupported target Objects',async()=>{
 const calls:Array<{sql:string;args:unknown[]}>= [];
 const client={query:async(sql:string,args:unknown[]=[])=>{
  calls.push({sql,args});
  if(sql.includes('FROM md_object_definitions'))return {rows:[{id:1}],rowCount:1};
  if(sql.includes('FROM md_named_credentials'))return {rows:[{id:1}],rowCount:1};
  return {rows:[],rowCount:1};
 }};
 const db={transaction:async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client)} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const service=new GlobalQuickActionMetadataService(db,rbac);
 assert.deepEqual(await service.save(t,u,sample),{actions:sample});
 assert.ok(calls.some(x=>x.sql.includes('DELETE FROM md_global_quick_actions')&&x.args[0]===t));
 assert.ok(calls.some(x=>x.sql.includes('INSERT INTO md_global_quick_actions')&&
  x.args.includes('Ticket__c')&&x.args.includes(t)));
 await assert.rejects(()=>service.save(t,u,[{...sample[0],targetObjectApi:'../unsafe'}]),
  /target Object/);
 await assert.rejects(()=>service.save(t,u,[...sample,...sample]),/Duplicate global action/);
});

test('Global action executor checks Action grant and reuses RecordEngine.create',async()=>{
 const created:unknown[][]=[];
 const rbac={require:async(_tenant:string,_user:string,resource:string)=>{
  if(resource==='Action:Global.CreateTicket')return;
  throw Error('Unexpected permission '+resource);
 }} as unknown as RbacEngine;
 const db={query:async()=>({rows:[{behavior:'Create Record',target_object_api:'Ticket__c'}],rowCount:1})} as unknown as SqlPersistence;
 const records={create:async(...args:unknown[])=>{created.push(args);return 'ticket-1';}} as unknown as RecordEngine;
 const svc=new ObjectQuickActionRuntime(db,rbac,records,
  {} as RecordCollaborationService,{} as FlowRuntime);
 assert.deepEqual(await svc.executeGlobal(actor,'CreateTicket',{Name:'Ticket'}),
  {status:'completed',recordId:'ticket-1',objectApiName:'Ticket__c'});
 assert.deepEqual(created[0],[t,u,'Ticket__c',{Name:'Ticket'}]);
});

test('Global email refuses client credential override and delegates to shared SMTP permissions',async()=>{
 const sent:unknown[][]=[];
 const db={query:async()=>({rows:[{behavior:'Send Email',credential_id:credential,
    from_email:'sender@example.com'}],rowCount:1})} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const named={sendQuickActionEmail:async(...args:unknown[])=>{sent.push(args);}} as unknown as NamedCredentialService;
 const svc=new ObjectQuickActionRuntime(db,rbac,{} as RecordEngine,
  {} as RecordCollaborationService,{} as FlowRuntime,named);
 await svc.executeGlobal(actor,'EmailEveryone',{to:'one@example.com',subject:'Update',body:'Message'});
 assert.deepEqual(sent[0],[t,u,'Global','','EmailEveryone',credential,'sender@example.com',
  'one@example.com','Update','Message',undefined]);
 await assert.rejects(()=>svc.executeGlobal(actor,'EmailEveryone',{
  credentialId:'other',to:'one@example.com',subject:'Update',body:'Message'}),/Invalid global email input/);
 assert.equal(sent.length,1);
});
