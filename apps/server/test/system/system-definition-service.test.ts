import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {SystemDefinitionService} from '../../src/system-files/system-definition-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

test('system definitions scope reads by tenant and resource permission',async()=>{
 const calls:Array<{sql:string;args:unknown[]}>=[];const db={
  query:async(sql:string,args:unknown[])=>{calls.push({sql,args});return {rows:[{api_name:'Demo',label:'Demo',revision:1,enabled:true,properties:{title:'Dashboard'}}]};}
 } as unknown as SqlPersistence;
 const grants:Array<[string,string,string,string]>=[];
 const rbac={require:async(t:string,u:string,r:string,a:string)=>{grants.push([t,u,r,a]);}} as unknown as RbacEngine;
 const svc=new SystemDefinitionService(db,rbac);
 const result=await svc.list('tenant-1','user-1','dashboards');
 assert.equal(result[0].apiName,'Demo');
 assert.deepEqual(calls[0].args,['tenant-1','dashboards']);
 assert.deepEqual(grants[0],['tenant-1','user-1','SystemDefinition:dashboards','read']);
});

test('system definitions reject embedded secrets before writing SQL',async()=>{
 const db={query:async()=>{throw new Error('Unexpected SQL write');}} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const svc=new SystemDefinitionService(db,rbac);
 await assert.rejects(()=>svc.save('t','u','integration-connections',{apiName:'Remote',label:'Remote',configuration:{apiKey:'unprotected'}}),/Credential secrets/);
});

test('system definitions reject missing manage permission',async()=>{
 const db={query:async()=>{throw new Error('Unexpected SQL write');}} as unknown as SqlPersistence;
 const rbac={require:async()=>{throw new Error('Permission denied');}} as unknown as RbacEngine;
 const svc=new SystemDefinitionService(db,rbac);
 await assert.rejects(()=>svc.save('t','u','reports',{apiName:'Report',label:'Report'}),/Permission denied/);
});

test('system definition updates use optimistic revision and cannot silently insert',async()=>{
 const seen:string[]=[];
 const db={query:async(sql:string,args:unknown[])=>{seen.push(sql);assert.equal(args[6],2);return {rows:[{revision:3}]};}} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const svc=new SystemDefinitionService(db,rbac);
 const saved=await svc.save('t','u','reports',{apiName:'Sales',label:'Sales',revision:2});
 assert.equal(saved.revision,3);
 assert.match(seen[0],/UPDATE md_system_definitions/);
 assert.match(seen[0],/revision=\$7/);
});

test('Platform Event metadata saves fields and picklists relationally in one transaction',async()=>{
 const writes:Array<{sql:string;args:unknown[]}>=[];let committed=false;
 const db={
  query:async()=>({rows:[]}),
  transaction:async<T>(run:(client:{query:(sql:string,args?:unknown[])=>Promise<{rows:Array<{revision:number}>}>})=>Promise<T>)=>{
   const result=await run({query:async(sql,args=[])=>{
    writes.push({sql,args});
    if(sql.includes('FROM md_named_credentials'))
     return {rows:[{id:'00000000-0000-4000-8000-000000000009'}]};
    return {rows:sql.includes('INSERT INTO md_system_definitions')?[{revision:1}]:[]};
   }});
   committed=true;return result;
  }
 } as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const saved=await new SystemDefinitionService(db,rbac).save('t','u','platform-events',{
  apiName:'Order_Updated__e',label:'Order Updated',description:'Order changed',
  fields:[{apiName:'Status__c',label:'Status',dataType:'Picklist',required:true,
   picklistRestricted:true,picklistValues:['New','Paid']}]
 });
 assert.equal(committed,true);
 assert.equal(saved.revision,1);
 assert.deepEqual(saved.fields,[{apiName:'Status__c',label:'Status',dataType:'Picklist',
  required:true,picklistRestricted:true,picklistValues:['New','Paid']}]);
 const definitionWrite=writes.find(write=>write.sql.includes('INSERT INTO md_system_definitions'));
 assert.equal(definitionWrite?.args[4],'{}');
 assert(writes.some(write=>write.sql.includes('INSERT INTO md_platform_event_details')));
 assert(writes.some(write=>write.sql.includes('INSERT INTO md_platform_event_fields')));
 assert.equal(writes.filter(write=>write.sql.includes('INSERT INTO md_platform_event_picklist_values')).length,2);
});

test('Platform Event metadata reads field and picklist metadata from relational tables',async()=>{
 const db={query:async(sql:string)=>{
  if(sql.includes('FROM md_system_definitions'))return {rows:[{
   api_name:'Order_Updated__e',label:'Order Updated',properties:{},revision:2,enabled:true
  }]};
  if(sql.includes('FROM md_platform_event_details'))return {rows:[{
   event_api_name:'Order_Updated__e',description:'Order changed'
  }]};
  if(sql.includes('FROM md_platform_event_fields'))return {rows:[{
   event_api_name:'Order_Updated__e',field_api:'Status__c',label:'Status',data_type:'Picklist',
   required:true,picklist_restricted:true
  }]};
  if(sql.includes('FROM md_platform_event_picklist_values'))return {rows:[
   {event_api_name:'Order_Updated__e',field_api:'Status__c',value_text:'New'},
   {event_api_name:'Order_Updated__e',field_api:'Status__c',value_text:'Paid'}
  ]};
  throw new Error('Unexpected SQL: '+sql);
 }} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const [event]=await new SystemDefinitionService(db,rbac).list('t','u','platform-events');
 assert.equal(event.description,'Order changed');
 assert.deepEqual(event.fields,[{apiName:'Status__c',label:'Status',dataType:'Picklist',
  required:true,picklistRestricted:true,picklistValues:['New','Paid']}]);
});

test('Platform Event metadata rejects malformed fields before writing',async()=>{
 let wrote=false;
 const db={query:async()=>({rows:[]}),transaction:async()=>{wrote=true;}} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 await assert.rejects(()=>new SystemDefinitionService(db,rbac).save('t','u','platform-events',{
  apiName:'Bad__e',label:'Bad',fields:[{apiName:'bad-name',label:'Bad',dataType:'Text(255)'}]
 }),/Invalid Platform Event field/);
 await assert.rejects(()=>new SystemDefinitionService(db,rbac).save('t','u','platform-events',{
  apiName:'BadPicklist__e',label:'Bad Picklist',fields:[{apiName:'Status__c',label:'Status',
   dataType:'Picklist',picklistRestricted:true,picklistValues:[]}]
 }),/Restricted Platform Event picklists require at least one value/);
 await assert.rejects(()=>new SystemDefinitionService(db,rbac).save('t','u','platform-events',{
  apiName:'BadText__e',label:'Bad Text',fields:[{apiName:'Name__c',label:'Name',
   dataType:'Text(255)',picklistValues:['Not a picklist']}]
 }),/Picklist settings require a Picklist field/);
 assert.equal(wrote,false);
});

test('Platform Event migration validates and backfills legacy JSON before removing it',()=>{
 const migration=readFileSync(new URL(
  '../../src/system-support/migrations/20261102-platform-event-fields.sql',import.meta.url),'utf8');
 assert.match(migration,/RAISE EXCEPTION 'Platform Event metadata must be repaired before relational migration'/);
 assert.match(migration,/INSERT INTO md_platform_event_details/);
 assert.match(migration,/INSERT INTO md_platform_event_fields/);
 assert.match(migration,/INSERT INTO md_platform_event_picklist_values/);
 assert.ok(migration.indexOf('INSERT INTO md_platform_event_picklist_values')
  <migration.indexOf("UPDATE md_system_definitions SET properties='{}'::jsonb"));
 assert.match(migration,/ON CONFLICT\(tenant_id,event_api_name,field_api,value_text\)/);
});

test('Email Alert metadata saves tenant SMTP references and content relationally',async()=>{
 const writes:Array<{sql:string;args:unknown[]}>=[];let committed=false;
 const db={
  query:async(sql:string)=>sql.includes('FROM md_named_credentials')
   ?{rows:[{id:'00000000-0000-4000-8000-000000000009'}]}:{rows:[]},
  transaction:async<T>(run:(client:{query:(sql:string,args?:unknown[])=>Promise<{rows:Array<{revision:number}>}>})=>Promise<T>)=>{
   const result=await run({query:async(sql,args=[])=>{
    writes.push({sql,args});
    if(sql.includes('FROM md_named_credentials'))
     return {rows:[{revision:1,id:'00000000-0000-4000-8000-000000000009'}]};
    return {rows:sql.includes('INSERT INTO md_system_definitions')?[{revision:1}]:[]};
   }});
   committed=true;return result;
  }
 } as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const saved=await new SystemDefinitionService(db,rbac).save('t','u','email-alerts',{
  apiName:'Account_Changed',label:'Account Changed',objectApiName:'Account',
  namedCredentialId:'00000000-0000-4000-8000-000000000009',
  fromEmail:'sales@example.com',recipients:'{!$Record.Email}',
  subject:'Account changed',body:'Hello {!$Record.Name}'
 });
 assert.equal(committed,true);
 assert.equal(saved.revision,1);
 const definition=writes.find(write=>write.sql.includes('INSERT INTO md_system_definitions'));
 assert.equal(definition?.args[4],'{}');
 const detail=writes.find(write=>write.sql.includes('INSERT INTO md_email_alert_details'));
 assert.deepEqual(detail?.args.slice(1),['Account_Changed','Account',
  '00000000-0000-4000-8000-000000000009','sales@example.com',
  '{!$Record.Email}','Account changed','Hello {!$Record.Name}']);
});

test('Email Alert metadata is listed from relational details',async()=>{
 const db={query:async(sql:string)=>{
  if(sql.includes('FROM md_system_definitions'))return {rows:[{
   api_name:'Account_Changed',label:'Account Changed',properties:{},revision:1,enabled:true
  }]};
  if(sql.includes('FROM md_email_alert_details'))return {rows:[{
   alert_api_name:'Account_Changed',object_api:'Account',
   credential_id:'00000000-0000-4000-8000-000000000009',from_email:'sales@example.com',
   recipients:'{!$Record.Email}',subject:'Account changed',body:'Hello'
  }]};
  throw new Error('Unexpected SQL: '+sql);
 }} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const [alert]=await new SystemDefinitionService(db,rbac).list('t','u','email-alerts');
 assert.deepEqual({
  objectApiName:alert.objectApiName,namedCredentialId:alert.namedCredentialId,
  fromEmail:alert.fromEmail,recipients:alert.recipients,subject:alert.subject,body:alert.body
 },{objectApiName:'Account',namedCredentialId:'00000000-0000-4000-8000-000000000009',
  fromEmail:'sales@example.com',recipients:'{!$Record.Email}',subject:'Account changed',body:'Hello'});
});

test('Email Alert migration preserves existing definitions in relational metadata',()=>{
 const migration=readFileSync(new URL(
  '../../src/system-support/migrations/20261104-email-alert-details.sql',import.meta.url),'utf8');
 assert.match(migration,/RAISE EXCEPTION 'Email Alert metadata or SMTP credentials must be repaired before relational migration'/);
 assert.match(migration,/INSERT INTO md_email_alert_details/);
 assert.match(migration,/UPDATE md_system_definitions SET properties='{}'::jsonb WHERE kind='email-alerts'/);
});
