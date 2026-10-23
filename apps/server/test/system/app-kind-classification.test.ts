import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {loadTenantApps} from '../../src/app-runtime/TenantAppLoader.js';
import {AppRuntime} from '../../src/system-files/app-runtime.js';
import {seedConnectorAppCatalog} from '../../src/app-seeders/connector-apps.js';

test('only installed, licensed Application packages are returned as launchable apps',async()=>{
 const db={query:async(sql:string,args:unknown[])=>{
  assert.match(sql,/a\.app_type='Application'/);
  assert.match(sql,/md_app_installations/);
  assert.match(sql,/md_app_entitlements/);
  assert.match(sql,/e\.active=true/);
  assert.deepEqual(args,['tenant-1']);
  return {rows:[{id:'app-1',api_name:'AceAssist',label:'Ace Assist'}]};
 }} as unknown as SqlPersistence;
 const apps=await loadTenantApps(db,'tenant-1');
 assert.deepEqual(apps.map(app=>app.api_name),['AceAssist']);
});

test('AppExchange retains both connector and application packages, with distinct SQL categories',async()=>{
 const db={query:async(sql:string,args:unknown[])=>{
  assert.match(sql,/a\.app_type/);
  assert.match(sql,/md_app_installations/);
  assert.deepEqual(args,['tenant-1']);
  return {rows:[
   {id:'one',api_name:'AceAssist',label:'Ace Assist',app_type:'Application',installed:true,licensed:true},
   {id:'two',api_name:'SmsGateConnector',label:'SMS Gate Connector',app_type:'ConnectorApp',installed:true,licensed:true}
  ]};
 }} as unknown as SqlPersistence;
 const result=await new AppRuntime(db).marketplace('tenant-1');
 assert.deepEqual(result.records.map(row=>({app:row.AppKey__c,type:row.AppType__c,category:row.Category__c})),[
  {app:'AceAssist',type:'Application',category:'Applications'},
  {app:'SmsGateConnector',type:'ConnectorApp',category:'Connector Apps'}
 ]);
});

test('connector catalog seeding marks only the six platform connector manifests and is repeatable',async()=>{
 const inserts:string[]=[];
 const clients={query:async(sql:string,args:unknown[]=[])=>{
  if(sql.includes('INSERT INTO md_apps')){
   assert.match(sql,/app_type/);
   assert.match(sql,/VALUES\(\$1,\$2,true,NULL,'ConnectorApp'\)/);
   assert.match(sql,/ON CONFLICT\(api_name\) DO UPDATE/);
   assert.match(sql,/md_apps\.tenant_owner_id IS NULL/);
   inserts.push(String(args[0]));
  }
  if(sql.includes('SELECT id FROM md_apps'))return {rows:[{id:'package-id'}],rowCount:1};
  return {rows:[],rowCount:1};
 }};
 const db={transaction:async(run:(client:typeof clients)=>Promise<void>)=>run(clients)} as unknown as Pick<SqlPersistence,'transaction'>;
 await seedConnectorAppCatalog(db);
 await seedConnectorAppCatalog(db);
 assert.equal(inserts.length,12);
 assert.deepEqual(inserts.slice(0,6),inserts.slice(6));
 assert.deepEqual(inserts.slice(0,6).sort(),[
  'BrevoConnector','DeliverooConnector','JustEatConnector',
  'SmsGateConnector','UberEatsConnector','WhatsAppConnector'
 ].sort());
});
