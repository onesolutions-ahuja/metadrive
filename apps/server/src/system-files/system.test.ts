import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthenticationService } from './authentication.js';
import { RbacEngine } from './rbac-engine.js';
import { ObjectDefinitionService } from './object-definition.js';
import type { SqlPersistence } from './sql-persistence.js';

test('authentication hashes and verifies passwords without storing plain text', async () => {
  const queries: Array<{ sql: string; args: unknown[] }> = [];
  const db = { query: async (sql: string, args: unknown[]) => { queries.push({ sql, args }); return { rows: [] }; } } as unknown as SqlPersistence;
  const auth = new AuthenticationService(db);
  const encoded = await auth.hashPassword('LongRandomPassphrase!2026');
  assert.equal(await auth.verifyPassword('LongRandomPassphrase!2026', encoded), true);
  assert.equal(await auth.verifyPassword('incorrect-password', encoded), false);
  assert.equal(encoded.includes('LongRandomPassphrase!2026'), false);
});
test('RBAC fails closed without a matching grant', async () => {
  const db = { query: async () => ({ rows: [{ ok: false }] }) } as unknown as SqlPersistence;
  const rbac = new RbacEngine(db);
  assert.equal(await rbac.allowed('tenant', 'user', 'Product__c', 'read'), false);
  await assert.rejects(() => rbac.require('tenant', 'user', 'Product__c', 'read'), /Permission denied/);
});
test('metadata registration uses parameters and rejects invalid names', async () => {
  const calls: Array<{sql:string;args:unknown[]}> = [];
  const db = { query: async (sql: string, args: unknown[]) => { calls.push({sql,args}); return {rows:[{id:'new-object'}]}; } } as unknown as SqlPersistence;
  const service = new ObjectDefinitionService(db);
  await assert.rejects(() => service.register('tenant','abc;DROP TABLE', 'Bad'), /Invalid object definition/);
  await service.register('tenant','Product__c', 'Product');
  assert.match(calls[0].sql, /\$1/);
  assert.equal(calls[0].args[1], 'Product__c');
});

test('explicit deny takes precedence over a grant', async () => {
  const db={query:async()=>({rows:[{allow_granted:true,deny_granted:true}]})} as unknown as SqlPersistence;
  assert.equal(await new RbacEngine(db).allowed('tenant','user','Product__c','read'),false);
});
test('SQL record CRUD rejects fields not registered in metadata', async () => {
  const db={
    query:async(sql:string)=> sql.includes('FROM md_field_definitions')
      ?{rows:[{api_name:'Price',data_type:'number',related_object:null,required:false}]}
      :{rows:[],rowCount:0}
  } as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const {RecordEngine}=await import('./record-engine.js');
  await assert.rejects(
    ()=>new RecordEngine(db,rbac).create('tenant','user','Product__c',{Unexpected:1}),
    /Unknown field/
  );
  await assert.rejects(
    ()=>new RecordEngine(db,rbac).create('tenant','user','Product__c',{Price:'not a number'}),
    /Invalid number/
  );
});

test('registered browser origin cannot select another tenant by slug', async () => {
  const {createSystemServer}=await import('./server.js');
  const touched:string[]=[];
  const db={
    query:async(sql:string,params:unknown[])=>{
      touched.push(sql);
      if(sql.includes('FROM md_tenant_domains')) {
        assert.deepEqual(params,['tenant-a.example']);
        return {rows:[{tenant_id:'tenant-a'}],rowCount:1};
      }
      if(sql.includes('FROM md_tenants')) return {rows:[{id:'tenant-b'}],rowCount:1};
      throw new Error('Cross-tenant authentication must stop before reading credentials');
    }
  } as unknown as SqlPersistence;
  const app=createSystemServer(db);
  const listener=app.listen(0,'127.0.0.1');
  try {
    if(!listener.listening) await import('node:events').then(({once})=>once(listener,'listening'));
    const port=(listener.address() as import('node:net').AddressInfo).port;
    const response=await fetch(`http://127.0.0.1:${port}/api/auth/login`,{
      method:'POST',
      headers:{'Origin':'https://tenant-a.example','Content-Type':'application/json'},
      body:JSON.stringify({tenantSlug:'tenant-b',email:'test@example.com',password:'password'})
    });
    assert.equal(response.status,401);
    assert.equal(touched.some(sql=>sql.includes('FROM md_users')),false);
  } finally {
    if(listener.listening) await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
  }
});

test('home page resolution rejects uninstalled apps and preserves empty home assignment', async () => {
  const {AppRuntime}=await import('./app-runtime.js');
  const db={query:async()=>({rows:[]})} as unknown as SqlPersistence;
  await assert.rejects(()=>new AppRuntime(db).homePage('tenant','NotInstalled','desktop'),/Permission denied/);
  const noHome={query:async()=>({rows:[{api_name:null}]})} as unknown as SqlPersistence;
  assert.equal(await new AppRuntime(noHome).homePage('tenant','MyApp','desktop'),null);
});
test('tenant-specific object lookup cannot return an unregistered object', async () => {
  const calls:string[]=[];
  const db={query:async(sql:string)=>{calls.push(sql);return {rows:[]}}} as unknown as SqlPersistence;
  const svc=new ObjectDefinitionService(db);
  await assert.rejects(()=>svc.get('tenant','OtherTenant__c'),/Object not found/);
  assert.ok(calls.every(sql=>sql.includes('tenant_id=$1')));
});

test('object creation writes Object and Fields in a single transaction', async () => {
  const writes:string[]=[];
  const client={query:async(sql:string)=>{writes.push(sql);return {rows:[{id:'created'}],rowCount:1}}};
  const db={
    transaction:async(fn:(arg:typeof client)=>Promise<unknown>)=>fn(client),
    query:async(sql:string)=>sql.includes('md_object_definitions')
      ? {rows:[{id:'created',api_name:'Item__c',label:'Item',is_system:false}]}
      : {rows:[{object_api:'Item__c',api_name:'Name',data_type:'text',related_object:null,required:true}]}
  } as unknown as SqlPersistence;
  const object=await new ObjectDefinitionService(db).create('tenant','Item__c','Item',[
    {apiName:'Name',label:'Name',dataType:'Text(80)',required:true,unique:false}
  ]);
  assert.equal(object.fields[0].apiName,'Name');
  assert.ok(writes.some(sql=>sql.includes('INSERT INTO md_object_definitions')));
  assert.ok(writes.some(sql=>sql.includes('INSERT INTO md_field_definitions')));
});
test('atomic object creation rejects unsupported fields before any SQL write', async () => {
  const db={transaction:async()=>{throw Error('Should not be called')}} as unknown as SqlPersistence;
  await assert.rejects(()=>new ObjectDefinitionService(db).create('tenant','A__c','A',
    [{apiName:'Private',dataType:'UnsupportedValue'}]),/Invalid field definition/);
});

test('Records HTTP API returns the actual list rather than double-nested records', async () => {
  const {createSystemServer}=await import('./server.js');
  const db={
    query:async(sql:string)=>{
      if(sql.includes('FROM md_sessions s JOIN md_users'))return {rows:[{tenant_id:'tenant',user_id:'user'}]};
      if(sql.includes('FROM md_permission_rules'))return {rows:[{allow_granted:true,deny_granted:false}]};
      if(sql.includes('WITH selected AS'))return {rows:[]};
      if(sql.includes('count(*)::text'))return {rows:[{total:'0'}]};
      throw new Error('Unexpected SQL '+sql);
    }
  } as unknown as SqlPersistence;
  const app=createSystemServer(db);
  const listener=app.listen(0,'127.0.0.1');
  try {
    if(!listener.listening)await import('node:events').then(({once})=>once(listener,'listening'));
    const port=(listener.address() as import('node:net').AddressInfo).port;
    const response=await fetch(`http://127.0.0.1:${port}/api/records/Product__c`,{
      headers:{Authorization:'Bearer valid-token'}
    });
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{records:[],total:0});
  } finally {
    if(listener.listening)await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
  }
});

test('creating a duplicate Field never mutates its existing type or lookup target', async () => {
  const queries:string[]=[];
  const db={query:async(sql:string)=>{queries.push(sql);return {rows:[],rowCount:0}}} as unknown as SqlPersistence;
  const svc=new ObjectDefinitionService(db);
  await assert.rejects(()=>svc.addField('tenant','Sale__c','ProductId','Lookup','Product__c'),/Field already exists/);
  assert.ok(queries.every(q=>!q.includes('DO UPDATE')));
});
test('text field length is returned in metadata and enforced when writing records', async () => {
  const db={
    query:async(sql:string)=>sql.includes('FROM md_field_definitions')
      ?{rows:[{api_name:'Name',data_type:'text',related_object:null,required:false,max_length:4}]}:{rows:[],rowCount:0}
  } as unknown as SqlPersistence;
  const {RecordEngine}=await import('./record-engine.js');
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  await assert.rejects(()=>new RecordEngine(db,rbac).create('tenant','user','Item__c',{Name:'Too long'}),/Invalid text length/);
});


test('SQL cutover inventory preserves inactive objects and flags unresolved lookups',async()=>{
  const {inspectSqlCutover}=await import('./cutover-preflight.js');
  const tables=['md_v2_object_registry','md_v2_field_registry','metadrive_rel_tenants'];
  const objects=[
    {object_id:'a',tenant_id:'dev',api_name:'Sale__c',object_label:'Sale',physical_table:'md_obj_'+'a'.repeat(32),active:true},
    {object_id:'b',tenant_id:'dev',api_name:'DeletedProduct__c',object_label:'Deleted',physical_table:'md_obj_'+'b'.repeat(32),active:false}
  ];
  tables.push(objects[0].physical_table);
  const fields=[
    {field_id:'f',object_id:'a',api_name:'CustomerId',field_label:'Customer',source_data_type:'Lookup(User)',physical_column:'md_fld_'+'a'.repeat(32),active:true},
    {field_id:'g',object_id:'b',api_name:'InactiveField',field_label:'Old',source_data_type:'Text',physical_column:'md_fld_'+'b'.repeat(32),active:true}
  ];
  const db={query:async(sql:string)=>{
    if(sql.includes('information_schema.tables'))return {rows:tables.map(table_name=>({table_name}))};
    if(sql.includes('md_v2_object_registry'))return {rows:objects};
    if(sql.includes('md_v2_field_registry'))return {rows:fields};
    throw Error('Unexpected SQL');
  }} as unknown as SqlPersistence;
  const report=await inspectSqlCutover(db);
  assert.equal(report.source.activeObjects,1);
  assert.equal(report.source.retiredObjects,1);
  assert.equal(report.source.activeFields,1);
  assert.equal(report.source.unresolvedLookups,1);
  assert.equal(report.safeToMigrate,false);
  assert.ok(report.blockers.some(x=>x.code==='LOOKUP_TARGET_MISSING'&&x.target==='User'));
});


test('Flow with Start and End completes without unconfigured actions', async () => {
  const {FlowRuntime}=await import('./flow-runtime.js');
  const client={query:async(sql:string)=>{
    if(sql.includes('INSERT INTO md_flow_runs'))return {rows:[{id:'run-id'}],rowCount:1};
    if(sql.includes('FROM md_flow_runs r JOIN'))return {rows:[{flow_id:'flow-id',started_by:'user',status:'pending',api_name:'SimpleFlow'}]};
    if(sql.includes('FROM md_flow_nodes WHERE'))return {rows:[
      {id:'start-node',api_name:'start',node_type:'Start'},
      {id:'end-node',api_name:'finish',node_type:'End'}
    ]};
    if(sql.includes('FROM md_flow_edges'))return {rows:[{source_api:'start',target_api:'finish',outcome:'default'}]};
    if(sql.includes('FROM md_flow_node_properties'))return {rows:[]};
    if(sql.includes('FROM md_flow_run_inputs'))return {rows:[]};
    if(sql.startsWith('UPDATE md_flow_runs'))return {rows:[],rowCount:1};
    throw new Error('Unexpected Flow query');
  }};
  const db={
    query:async(sql:string)=>sql.includes('md_flow_definitions')?{rows:[{id:'flow-id',version:1}]}:{rows:[],rowCount:1},
    transaction:async(fn:(client:typeof client)=>Promise<unknown>)=>fn(client)
  } as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const records={} as import('./record-engine.js').RecordEngine;
  assert.deepEqual(await new FlowRuntime(db,rbac,records).execute('tenant','SimpleFlow','user'),{id:'run-id',status:'completed'});
});
test('Flow execution refuses unauthorized callers without creating runs',async()=>{
  const {FlowRuntime}=await import('./flow-runtime.js');
  let called=false;
  const db={query:async()=>{called=true;return{rows:[]}}} as unknown as SqlPersistence;
  const rbac={require:async()=>{throw Error('Permission denied')}} as unknown as RbacEngine;
  await assert.rejects(()=>new FlowRuntime(db,rbac).execute('tenant','Flow','user'),/Permission denied/);
  assert.equal(called,false);
});
