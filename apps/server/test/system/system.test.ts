import {withFlowCapabilities} from './flow-capability-test-helper.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AuthenticationService } from '../../src/system-files/authentication.js';
import { RbacEngine } from '../../src/system-files/rbac-engine.js';
import { ObjectDefinitionService } from '../../src/system-files/object-definition.js';
import type { SqlPersistence } from '../../src/system-files/sql-persistence.js';

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
  const {RecordEngine}=await import('../../src/system-files/record-engine.js');
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
  const {createSystemServer}=await import('../../src/system-support/server.js');
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
  const {AppRuntime}=await import('../../src/system-files/app-runtime.js');
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
  const {createSystemServer}=await import('../../src/system-support/server.js');
  const db={transaction:async(run:(c:{query:()=>Promise<{rows:unknown[]}>})=>Promise<unknown>)=>run({query:async()=>({rows:[]})}),
    query:async(sql:string)=>{
      if(sql.includes('md_monitor_events'))return {rows:[],rowCount:0};
    if(sql.startsWith('WITH active AS'))return {rows:[{tenant_id:'tenant',user_id:'user'}]};
      if(sql.includes('md_login_boundary_allowed'))return {rows:[{allowed:true,trusted:false}]};
      if(sql.startsWith('UPDATE md_sessions s SET last_seen_at'))return {rows:[{id:'session'}],rowCount:1};
      if(sql.startsWith('UPDATE md_refresh_sessions r SET last_seen_at'))return {rows:[],rowCount:1};
      if(sql.includes('md_rbac_decision'))return {rows:[{ordinal:1,allow_granted:true,deny_granted:false}]};
      if(sql.includes('SELECT api_name,data_type,related_object'))return {rows:[]};
      if(sql.includes('md_metadata_package_components'))return {rows:[{retained:false}]};
      if(sql.includes('INSERT INTO md_tenant_api_usage_daily'))return {rows:[],rowCount:1};
      if(sql.includes('WITH authorized AS MATERIALIZED'))return {rows:[{id:null,total_count:'0'}]};
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
    const body=await response.text();
    assert.equal(response.status,200,body);
    assert.deepEqual(JSON.parse(body),{records:[],total:0});
  } finally {
    if(listener.listening)await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
  }
});

test('creating a duplicate Field never mutates its existing type or lookup target', async () => {
  const queries:string[]=[];
  const query=async(sql:string)=>{queries.push(sql);return {rows:[],rowCount:0}};
  const db={query,transaction:async(fn:(client:{query:typeof query})=>Promise<unknown>)=>fn({query})} as unknown as SqlPersistence;
  const svc=new ObjectDefinitionService(db);
  await assert.rejects(()=>svc.addField('tenant','Sale__c','ProductId','Lookup','Product__c'),/Field already exists/);
  assert.ok(queries.every(q=>!q.includes('DO UPDATE')));
});
test('text field length is returned in metadata and enforced when writing records', async () => {
  const db={
    query:async(sql:string)=>sql.includes('FROM md_field_definitions')
      ?{rows:[{api_name:'Name',data_type:'text',related_object:null,required:false,max_length:4}]}:{rows:[],rowCount:0}
  } as unknown as SqlPersistence;
  const {RecordEngine}=await import('../../src/system-files/record-engine.js');
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  await assert.rejects(()=>new RecordEngine(db,rbac).create('tenant','user','Item__c',{Name:'Too long'}),/Invalid text length/);
});


test('SQL cutover inventory preserves inactive objects and flags unresolved lookups',async()=>{
  const {inspectSqlCutover}=await import('../../src/system-support/cutover-preflight.js');
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
  const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
  const client={query:async(sql:string)=>{
    if(sql.includes('INSERT INTO md_flow_runs'))return {rows:[{id:'run-id'}],rowCount:1};
    if(sql.includes('SELECT started_by FROM md_flow_runs'))
      return {rows:[{started_by:'user'}],rowCount:1};
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
    query:async(sql:string)=>sql.includes('SELECT started_by FROM md_flow_runs')
      ?{rows:[{started_by:'user'}],rowCount:1}
      :sql.includes('md_flow_definitions')?{rows:[{id:'flow-id',version:1}]}:{rows:[],rowCount:1},
    transaction:async(fn:(client:typeof client)=>Promise<unknown>)=>fn(client)
  } as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const records={} as import('../../src/system-files/record-engine.js').RecordEngine;
  assert.deepEqual(await new FlowRuntime(db,rbac,records).execute('tenant','SimpleFlow','user'),{id:'run-id',status:'completed'});
});
test('Flow execution refuses unauthorized callers without creating runs',async()=>{
  const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
  let called=false;
  const db={query:async()=>{called=true;return{rows:[]}}} as unknown as SqlPersistence;
  const rbac={require:async()=>{throw Error('Permission denied')}} as unknown as RbacEngine;
  await assert.rejects(()=>new FlowRuntime(db,rbac).execute('tenant','Flow','user'),/Permission denied/);
  assert.equal(called,false);
});


test('Fresh bootstrap never touches existing tenants or runs without explicit opt-in', async () => {
  const {bootstrapFreshTenant}=await import('../../src/system-support/server.js');
  let queries=0;
  let transactions=0;
  const db={
    query:async()=>{queries++;return{rows:[{count:'1'}]};},
    transaction:async()=>{transactions++;throw Error('Existing tenants must never be modified');}
  } as unknown as SqlPersistence;
  assert.equal(await bootstrapFreshTenant(db,{}),false);
  assert.equal(queries,0);
  assert.equal(await bootstrapFreshTenant(db,{METADRIVE_FRESH_BOOTSTRAP:'true'}),false);
  assert.equal(queries,1);
  assert.equal(transactions,0);
});

test('Aiven SQL connection retains certificate verification and dedicated DB override',async()=>{
  const {resolveSqlConnection}=await import('../../src/system-files/sql-persistence.js');
  const config=resolveSqlConnection(
    'postgres://user:password@db.example.net:12345/defaultdb?sslmode=require',
    {METADRIVE_DB_NAME_OVERRIDE:'metadrive_sql_20261012',
     METADRIVE_DB_CA_CERT:'-----BEGIN CERTIFICATE-----\\nmock-content\\n-----END CERTIFICATE-----'}
  );
  assert.equal(new URL(config.connectionString).pathname,'/metadrive_sql_20261012');
  assert.equal(new URL(config.connectionString).searchParams.has('sslmode'),false);
  assert.equal(config.ssl?.rejectUnauthorized,true);
  assert.equal(config.ssl?.servername,'db.example.net');
  assert.match(config.ssl?.ca??'',/BEGIN CERTIFICATE/);
  assert.doesNotMatch(config.ssl?.ca??'',/\\\\n/);
});


test('login does not misreport SQL session failure as bad credentials',async()=>{
  const {createSystemServer}=await import('../../src/system-support/server.js');
  const {AuthenticationService}=await import('../../src/system-files/authentication.js');
  const password='correct-password-123';
  const hash=await new AuthenticationService({} as SqlPersistence).hashPassword(password);
  const db={
    query:async(sql:string)=>{
      if(sql.includes('FROM md_tenant_domains'))return {rows:[{tenant_id:'tenant'}],rowCount:1};
      if(sql.includes('FROM md_users WHERE tenant_id'))return {rows:[{id:'user',password_hash:hash,enabled:true}],rowCount:1};
      throw Error('Unexpected SQL lookup');
    },
    transaction:async()=>{throw Error('Simulated SQL session persistence failure');}
  } as unknown as SqlPersistence;
  const app=createSystemServer(db),listener=app.listen(0,'127.0.0.1');
  try{
    if(!listener.listening)await import('node:events').then(({once})=>once(listener,'listening'));
    const port=(listener.address() as import('node:net').AddressInfo).port;
    const result=await fetch('http://127.0.0.1:'+port+'/api/auth/login',{
      method:'POST',headers:{origin:'https://unesolutions.co.uk','content-type':'application/json'},
      body:JSON.stringify({email:'support@unesolutions.co.uk',password})
    });
    assert.equal(result.status,503);
    assert.deepEqual(await result.json(),{error:'SQL service unavailable'});
  }finally{
    if(listener.listening)await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
  }
});

test('first-install reconciliation is opt-in and refuses multi-user databases',async()=>{
  const {reconcileBootstrapPassword}=await import('../../src/system-support/bootstrap-password-sync.js');
  let writes=0;
  const db={
    query:async()=>({rows:[{tenants:1,users:2}]}),
    transaction:async()=>{writes++;}
  } as unknown as SqlPersistence;
  assert.equal(await reconcileBootstrapPassword(db,{}),'disabled');
  await assert.rejects(()=>reconcileBootstrapPassword(db,{
    METADRIVE_SYNC_BOOTSTRAP_PASSWORD_ONCE:'true',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL:'test@example.com',
    METADRIVE_BOOTSTRAP_DOMAIN:'example.com',
    METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:'TestPasswordLong2026'
  }),/single-user installation/);
  assert.equal(writes,0);
});

test('reconciliation repairs one matching account exactly once',async()=>{
  const {reconcileBootstrapPassword}=await import('../../src/system-support/bootstrap-password-sync.js');
  const password='FreshDeveloperPassword2026';
  const auth=new AuthenticationService({} as SqlPersistence);
  let stored=await auth.hashPassword('OldDeveloperPassword2026'),marker=false,updates=0;
  const client={query:async(sql:string,args:unknown[]=[])=>{
    if(sql.includes('FROM md_users u JOIN'))return {rows:[{id:'u',tenant_id:'t',password_hash:stored}]};
    if(sql.includes('FROM md_bootstrap_password_repairs'))return {rows:marker?[{}]:[]};
    if(sql.startsWith('UPDATE md_users')){stored=String(args[0]);updates++;}
    if(sql.startsWith('INSERT INTO md_bootstrap_password_repairs'))marker=true;
    return {rows:[],rowCount:1};
  }};
  const db={query:async()=>({rows:[{tenants:1,users:1}]}),
    transaction:async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client)} as unknown as SqlPersistence;
  const env={METADRIVE_SYNC_BOOTSTRAP_PASSWORD_ONCE:'true',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL:'dev@example.com',
    METADRIVE_BOOTSTRAP_DOMAIN:'example.com',
    METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:password};
  assert.equal(await reconcileBootstrapPassword(db,env),'updated');
  assert.equal(await auth.verifyPassword(password,stored),true);
  assert.equal(await reconcileBootstrapPassword(db,env),'already-done');
  assert.equal(updates,1);
});

test('first-login password rotation is opt-in and refuses multi-user SQL',async()=>{
  const {rotateFirstLoginPassword}=await import('../../src/system-support/first-login-rotation.js');
  let transactions=0;
  const db={query:async()=>({rows:[{tenants:1,users:2}]}),
    transaction:async()=>{transactions++;}} as unknown as SqlPersistence;
  assert.equal(await rotateFirstLoginPassword(db,{}),'disabled');
  await assert.rejects(()=>rotateFirstLoginPassword(db,{
    METADRIVE_ROTATE_FIRST_LOGIN_ONCE:'true',
    METADRIVE_BOOTSTRAP_DOMAIN:'example.org',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL:'dev@example.org',
    METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:'abcdefghjkmnpqrstuvwxyz23456789'
  }),/precisely one tenant and one user/);
  assert.equal(transactions,0);
});
test('first-login rotation writes a fresh hash only once for matched domain/account',async()=>{
  const {rotateFirstLoginPassword}=await import('../../src/system-support/first-login-rotation.js');
  const auth=new AuthenticationService({} as SqlPersistence);
  let saved='',rotated=false,updates=0;
  const db={query:async()=>({rows:[{tenants:1,users:1}]}),
    transaction:async(fn:(c:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>fn({
      query:async(sql:string,args:unknown[]=[])=>{
        if(sql.includes('FROM md_users u JOIN'))return {rows:[{id:'dev',tenant_id:'one'}]};
        if(sql.includes('FROM md_initial_password_rotations'))return {rows:rotated?[{}]:[]};
        if(sql.includes('UPDATE md_users SET')){saved=String(args[0]);updates++;}
        if(sql.includes('INSERT INTO md_initial_password_rotations'))rotated=true;
        return {rows:[],rowCount:1};
      }
    })
  } as unknown as SqlPersistence;
  const env={METADRIVE_ROTATE_FIRST_LOGIN_ONCE:'true',
    METADRIVE_BOOTSTRAP_DOMAIN:'example.org',
    METADRIVE_BOOTSTRAP_ADMIN_EMAIL:'dev@example.org',
    METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:'abcdefghjkmnpqrstuvwxyz23456789'};
  assert.equal(await rotateFirstLoginPassword(db,env),'rotated');
  assert.equal(await auth.verifyPassword(env.METADRIVE_BOOTSTRAP_ADMIN_PASSWORD,saved),true);
  assert.equal(await rotateFirstLoginPassword(db,env),'already-rotated');
  assert.equal(updates,1);
});


test('Setup session metadata reuses OneEngine SQL policy, with explicit deny overriding allow',async()=>{
  const {sessionMetadata}=await import('../../src/system-files/session-metadata.js');
  const db={query:async(sql:string,params:unknown[])=>{
    assert.equal(params[0],'tenant');
    if(sql.includes('md_rbac_decision'))return {rows:[
      {ordinal:1,allow_granted:true,deny_granted:false},
      {ordinal:2,allow_granted:true,deny_granted:false},
      {ordinal:4,allow_granted:true,deny_granted:true},
      {ordinal:8,allow_granted:true,deny_granted:false}
    ]};
    if(sql.includes('FROM md_user_profiles'))return {rows:[]};
    if(sql.includes('FROM md_field_definitions'))return {rows:[]};
    if(sql.includes('FROM md_object_record_types'))return {rows:[]};
    if(sql.includes('SELECT landing_app_api FROM md_users'))return {rows:[{landing_app_api:'Setup'}]};
    if(sql.includes('INSERT INTO md_tenant_api_usage_daily'))return {rows:[],rowCount:1};
    assert.ok(sql.includes('md_rbac_decision'));
    assert.ok(sql.includes('md_rbac_decision'));
    assert.equal(params[1],'developer');
    assert.equal((params[2] as string[]).length,9);
    return {rows:[
      {ordinal:1,allow_granted:true,deny_granted:false},
      {ordinal:2,allow_granted:true,deny_granted:false},
      {ordinal:4,allow_granted:true,deny_granted:true},
      {ordinal:8,allow_granted:true,deny_granted:false}
    ]};
  }} as unknown as SqlPersistence;
  const result=await sessionMetadata(db,'tenant','developer');
  assert.equal(result.user.id,'developer');
  assert.equal(result.user.tenantId,'tenant');
  assert.deepEqual(result.user.permissions,['metadata:read','metadata:write','flows:system-context']);
  assert.deepEqual(result.user.fieldAccess,{});
});
test('Setup /auth/me returns the authenticated SQL policy, not an empty permission response',async()=>{
  const {createSystemServer}=await import('../../src/system-support/server.js');
  const db={transaction:async(run:(c:{query:()=>Promise<{rows:unknown[]}>})=>Promise<unknown>)=>run({query:async()=>({rows:[]})}),query:async(sql:string)=>{
    if(sql.includes('md_monitor_events'))return {rows:[],rowCount:0};
    if(sql.startsWith('WITH active AS'))
      return {rows:[{tenant_id:'tenant',user_id:'developer'}]};
    if(sql.includes('md_login_boundary_allowed'))return {rows:[{allowed:true,trusted:false}]};
    if(sql.startsWith('UPDATE md_sessions s SET last_seen_at'))return {rows:[{id:'session'}],rowCount:1};
    if(sql.startsWith('UPDATE md_refresh_sessions r SET last_seen_at'))return {rows:[],rowCount:1};
    if(sql.includes('md_rbac_decision'))return {rows:[{ordinal:1,allow_granted:true,deny_granted:false},{ordinal:2,allow_granted:true,deny_granted:false}]};
    if(sql.includes('FROM md_user_profiles'))return {rows:[]};
    if(sql.includes('FROM md_field_definitions'))return {rows:[]};
    if(sql.includes('FROM md_object_record_types'))return {rows:[]};
    if(sql.includes('SELECT landing_app_api FROM md_users'))return {rows:[{landing_app_api:'Acetill'}]};
    if(sql.includes('md_rbac_decision'))
      return {rows:[{ordinal:1,allow_granted:true,deny_granted:false},
        {ordinal:2,allow_granted:true,deny_granted:false}]};
    throw new Error('Unexpected query');
  }} as unknown as SqlPersistence;
  const listener=createSystemServer(db).listen(0,'127.0.0.1');
  try {
    if(!listener.listening)await import('node:events').then(({once})=>once(listener,'listening'));
    const port=(listener.address() as import('node:net').AddressInfo).port;
    const response=await fetch('http://127.0.0.1:'+port+'/api/auth/me',{
      headers:{Authorization:'Bearer validtoken'}
    });
    const body=await response.text();
    assert.equal(response.status,200,body);
    const json=JSON.parse(body) as {user?:{id:string;permissions:string[];landingAppApi:string}};
    assert.equal(json.user?.id,'developer');
    assert.ok(json.user?.permissions.includes('metadata:read'));
    assert.equal(json.user?.landingAppApi,'Acetill');
  }finally {
    if(listener.listening)await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
  }
});

test('SQL RBAC metadata endpoint exposes tenant-only policy definitions',async()=>{
 const calls:string[]=[];
 const query=async(sql:string,args:unknown[]=[])=>{
  if(sql.startsWith('SET TRANSACTION'))return {rows:[]};
  calls.push(sql);assert.equal(args[0],'tenant');
  if(sql.includes('md_rbac_decision'))return {rows:[{ordinal:1,allow_granted:true,deny_granted:false}]};
  const data:Record<string,unknown[]>={
   md_permission_sets:[{id:'ps1',api_name:'TenantDeveloper'}],
   md_roles:[{id:'r1',api_name:'Developer',label:'Developer',parent_role_id:null}],
   md_permission_rules:[{permission_set_id:'ps1',resource:'ObjectDefinition',action:'read',effect:'allow'}],
   md_users:[{id:'u1',email:'dev@example.invalid'}],
   md_profiles:[{id:'prof1',api_name:'Default',label:'Default Profile'}],
   md_user_profiles:[{user_id:'u1',profile_id:'prof1'}],md_user_roles:[{user_id:'u1',role_id:'r1'}],
   md_permission_assignments:[{user_id:'u1',permission_set_id:'ps1'}]
  };
  const table=/FROM (md_[a-z_]+)/.exec(sql)?.[1];
  assert.ok(table);assert.ok(sql.includes('tenant_id=$1'));
  return {rows:data[table!]??[]};
 };
 const db={query,transaction:async(fn:(tx:any)=>Promise<unknown>)=>fn({query})} as unknown as SqlPersistence;
 const result=await new RbacEngine(db).describe('tenant','user');
 assert.equal(result.tenantId,'tenant');
 assert.equal(result.permissionSets[0].apiName,'TenantDeveloper');
 assert.deepEqual(result.permissionSets[0].systemPermissions,['metadata:read']);
 assert.equal(result.users[0].profileId,'prof1');
 assert.equal(result.users[0].roleId,'r1');
 assert.equal(result.profiles[0].apiName,'Default');
 assert.ok(calls.every(sql=>sql.includes('tenant_id=$1')||sql.includes('md_rbac_decision')));
});
test('SQL RBAC metadata access fails closed without Security read permission',async()=>{
 const db={query:async()=>({rows:[]})} as unknown as SqlPersistence;
 await assert.rejects(()=>new RbacEngine(db).describe('tenant','user'),/Permission denied/);
});

test('Account password change checks old password and revokes sessions in the same SQL transaction',async()=>{
 const events:string[]=[];
 const seed=new AuthenticationService({} as SqlPersistence);
 const existing=await seed.hashPassword('CurrentPasswordABC123!');
 const db={
   transaction:async(run:(client:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<void>)=>
     run({query:async(sql:string,args:unknown[]=[])=>{
       events.push(sql);
       assert.equal(args[0],'tenant');
       if(sql.includes('FROM md_password_policies'))return {rows:[]};
       assert.equal(args[1],'user');
       if(sql.includes('SELECT password_hash'))return {rows:[{password_hash:existing}]};
       return {rows:[],rowCount:1};
     }})
 } as unknown as SqlPersistence;
 await new AuthenticationService(db).changePassword('tenant','user','CurrentPasswordABC123!','ChangedPasswordABC123!');
 assert.equal(events.filter(s=>s.includes('UPDATE md_sessions')).length,1);
 assert.equal(events.filter(s=>s.includes('UPDATE md_refresh_sessions')).length,1);
 assert.equal(events.filter(s=>s.includes('UPDATE md_users')).length,1);
 events.length=0;
 await assert.rejects(
   ()=>new AuthenticationService(db).changePassword('tenant','user','IncorrectPassword','ChangedPasswordABC123!'),
   /Invalid credentials/
 );
 assert.equal(events.filter(s=>s.startsWith('UPDATE')).length,0);
});
test('Account session list returns only current tenant/user SQL rows',async()=>{
 const db={query:async(sql:string,args:unknown[])=>{
   assert.match(sql,/WHERE tenant_id=\$1 AND user_id=\$2/);
   assert.deepEqual(args,['tenant','user']);
   return {rows:[{id:'family',expires_at:new Date('2026-10-20T12:00:00Z')}]};
 }} as unknown as SqlPersistence;
 const result=await new AuthenticationService(db).activeSessions('tenant','user');
 assert.deepEqual(result.sessions,[{familyId:'family',expiresAt:1792497600,mfaVerified:false}]);
});

test('Object relationship dependency discovery reads tenant-scoped SQL with no invented dependencies',async()=>{
 const calls:unknown[][]=[];
 const db={query:async(sql:string,args:unknown[])=>{
   calls.push(args);
   if(sql.includes('FROM md_field_formulas'))return {rows:[]};
   if(sql.includes('FROM md_object_definitions'))return {rows:[{id:'o1',api_name:'Sale__c',label:'Sale',is_system:false}]};
   if(sql.includes('SELECT f.id,f.object_api,f.api_name'))return {rows:[{id:'f1',object_api:'Sale__c',api_name:'CustomerId',label:'Customer',data_type:'reference',related_object:'Customer__c',required:false,max_length:null}]};
   if(sql.includes('SELECT object_api,related_object'))return {rows:[{object_api:'Sale__c',related_object:'Customer__c'}]};
   if(sql.includes('SELECT api_name,related_object'))return {rows:[{api_name:'CustomerId',related_object:'Customer__c'}]};
   if(sql.includes('FROM md_object_layout_versions')||sql.includes('FROM md_object_page_layout')||sql.includes('FROM md_object_record_type'))return {rows:[]};
  throw new Error('Unexpected SQL');
 }} as unknown as SqlPersistence;
 const engine=new ObjectDefinitionService(db);
 assert.deepEqual((await engine.dependencies('tenant','Sale__c')).dependencies,['Customer__c']);
 assert.deepEqual((await engine.fieldDependencies('tenant','Sale__c')).fields,[{fieldApiName:'CustomerId',dependencies:['Customer__c']}]);
 assert.ok(calls.every(args=>args[0]==='tenant'));
});

test('Flow logs expose only the caller tenant failed SQL runs with RBAC',async()=>{
 const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
 const calls:unknown[][]=[];
 const db={query:async(sql:string,args:unknown[])=>{
   calls.push(args);
   assert.match(sql,/r.tenant_id=\$1/);
   if(sql.includes("status='failed'"))return {rows:[{
     id:'r1',api_name:'ORDER_FLOW',label:'Order Flow',started_by:'user',
     finished_at:new Date('2026-10-18T12:00:00Z'),started_at:new Date('2026-10-18T11:00:00Z'),
     error_code:'FAILED_ACTION'
   }]};
   return {rows:[]};
 }} as unknown as SqlPersistence;
 const rbac={require:async(t:string,u:string,resource:string,action:string)=>{
   assert.deepEqual([t,u,resource,action],['tenant','user','FlowDefinition','read']);
 }} as unknown as RbacEngine;
 const result=await new FlowRuntime(db,rbac).failedLogs('tenant','user');
 assert.equal(result.logs[0].error,'FAILED_ACTION');
 assert.equal(result.logs[0].flowApiName,'ORDER_FLOW');
 assert.deepEqual(calls,[['tenant']]);
});
test('Pending Flow interviews use SQL pending runs rather than fabricated sample records',async()=>{
 const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
 const db={query:async(sql:string,args:unknown[])=>{
   assert.match(sql,/status IN \('pending','waiting'\)/);
   assert.deepEqual(args,['tenant']);
   return {rows:[]};
 }} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 assert.deepEqual(await new FlowRuntime(db,rbac).pendingInterviews('tenant','user'),{interviews:[]});
});

test('AppExchange catalog uses SQL tenant installations and entitlements',async()=>{
 const {AppRuntime}=await import('../../src/system-files/app-runtime.js');
 const db={query:async(sql:string,args:unknown[])=>{
   assert.match(sql,/md_app_installations/);
   assert.match(sql,/md_app_entitlements/);
   assert.deepEqual(args,['tenant']);
   return {rows:[{id:'app1',api_name:'CUSTOM_APP',label:'Custom App',installed:true,
     expires_at:null,licensed:true}]};
 }} as unknown as SqlPersistence;
 const value=await new AppRuntime(db).marketplace('tenant');
 assert.deepEqual(value.records,[{Id:'app1',Name:'Custom App',AppKey__c:'CUSTOM_APP',
   Description__c:'',CredentialName__c:'',Installed__c:true,LicenceStatus__c:'ACTIVE'}]);
});

test('Flow deactivation changes SQL state only for caller tenant and requires OneEngine manage',async()=>{
 const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
 const calls:unknown[][]=[];
 const db={query:async(sql:string,args:unknown[])=>{
  calls.push(args);
  if(sql.includes('SELECT id,api_name,label,flow_type')){
   return {rows:[{id:'f1',api_name:'MyFlow',label:'My Flow',flow_type:'Autolaunched Flow',version:2,active:false}]};
  }
  if(sql.includes('FROM md_flow_editor_values'))return {rows:[]};
  if(sql.includes('SELECT version,active FROM md_flow_definitions'))return {rows:[{version:2,active:false}]};
  if(sql.includes('FROM md_flow_nodes'))return {rows:[{api_name:'start',node_type:'Start'},{api_name:'end',node_type:'End'}]};
  if(sql.includes('FROM md_flow_edges'))return {rows:[{source_api:'start',target_api:'end',outcome:'default'}]};
  throw Error('Unexpected SQL');
 },transaction:async(run:(client:{query:(sql:string,args?:unknown[])=>Promise<{rowCount:number;rows:unknown[]}>})=>Promise<unknown>)=>
  run({query:async(sql,args=[])=>{
   calls.push(args);
   if(sql.includes('UPDATE md_flow_definitions')){
    assert.match(sql,/tenant_id=\$1/);return {rowCount:1,rows:[]};
   }
   return {rowCount:0,rows:[]};
  }})
 } as unknown as SqlPersistence;
 const rbac={require:async(tenant:string,user:string,resource:string,action:string)=>{
  assert.deepEqual([tenant,user,resource,action],['tenant','user','FlowDefinition','manage']);
 }} as unknown as RbacEngine;
 const result=await new FlowRuntime(db,rbac).deactivate('tenant','user','MyFlow');
 assert.equal(result.flow.status,'Draft');
 assert.deepEqual(calls[0],['tenant','MyFlow']);
});

test('Tenant company settings save validated SQL JSON under the authenticated tenant',async()=>{
 const {PlatformTenantService}=await import('../../src/system-files/platform-tenant-service.js');
 const queries:Array<{sql:string;args:unknown[]}>= [];
 const db={query:async(sql:string,args:unknown[])=>{
   queries.push({sql,args});
   return {rows:[{properties:{legalName:'Example Ltd'}}]};
 }} as unknown as SqlPersistence;
 const rbac={require:async(tenant:string,user:string,resource:string,action:string)=>{
   assert.deepEqual([tenant,user,resource,action],['tenant','user','TenantSettings','manage']);
 }} as unknown as RbacEngine;
 const svc=new PlatformTenantService(db,rbac);
 assert.deepEqual(await svc.saveSetting('tenant','user','company-profile',{legalName:'Example Ltd'}),{legalName:'Example Ltd'});
 assert.deepEqual(queries[0].args,['tenant','company-profile',JSON.stringify({legalName:'Example Ltd'})]);
 await assert.rejects(()=>svc.saveSetting('tenant','user','company-profile',{password:'not-a-setting'}),/Invalid company profile/);
 assert.equal(queries.length,1);
});
test('Tenant currency validation rejects duplicate ISO codes and invalid rates before SQL writes',async()=>{
 const {PlatformTenantService}=await import('../../src/system-files/platform-tenant-service.js');
 const db={query:async()=>{throw Error('No database write expected')}} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const svc=new PlatformTenantService(db,rbac);
 await assert.rejects(()=>svc.saveSetting('tenant','user','currencies',{
   corporateCurrency:'GBP',standardVatRate:20,
   currencies:[{currencyIsoCode:'GBP',conversionRate:1},{currencyIsoCode:'GBP',conversionRate:2}]
 }),/Invalid currency/);
 await assert.rejects(()=>svc.saveSetting('tenant','user','automation-settings',{
   autoRetryFailedFlows:true,maxRetryAttempts:10000,conversationIdleMinutes:5
 }),/Invalid automation settings/);
});

test('Automation service user is tenant-validated, relationally stored, and audited',async()=>{
 const {PlatformTenantService}=await import('../../src/system-files/platform-tenant-service.js');
 const serviceUser='00000000-0000-4000-8000-000000000022';
 const writes:Array<{sql:string;args:unknown[]}>=[];
 const txClient={query:async(sql:string,args:unknown[]=[])=>(writes.push({sql,args}),
   {rows:sql.includes('FOR UPDATE')?[]:[],rowCount:1})};
 const db={
  query:async(sql:string)=>sql.includes('FROM md_users')
   ?{rows:[{id:serviceUser}]}:{rows:[]},
  transaction:async<T>(operation:(client:typeof txClient)=>Promise<T>)=>operation(txClient)
 } as unknown as SqlPersistence;
 const service=new PlatformTenantService(db,{require:async()=>undefined} as unknown as RbacEngine);
 const saved=await service.saveSetting('tenant','admin','automation-settings',{
  autoRetryFailedFlows:false,maxRetryAttempts:10,conversationIdleMinutes:15,
  flowServiceUserId:serviceUser
 });
 assert.deepEqual(saved,{
  autoRetryFailedFlows:false,maxRetryAttempts:10,conversationIdleMinutes:15,
  flowServiceUserId:serviceUser
 });
 const settingsWrite=writes.find(write=>write.sql.includes('INSERT INTO md_tenant_settings'));
 assert.ok(settingsWrite);
 assert.deepEqual(JSON.parse(String(settingsWrite.args[1])),{
  autoRetryFailedFlows:false,maxRetryAttempts:10,conversationIdleMinutes:15
 });
 assert.ok(writes.some(write=>write.sql.includes('INSERT INTO md_tenant_automation_settings')));
 assert.ok(writes.some(write=>write.sql.includes('automation.flow-service-user.change')));
});

test('Field deletion retains field data in a recoverable recycle bin',async()=>{
 let hardDeletes=0,softDeletes=0;
 const db={
 query:async(sql:string)=>{
  if(sql.includes('FROM md_object_definitions'))return {rows:[{id:'o',api_name:'Sale__c',label:'Sale',is_system:false}]};
  if(sql.includes('FROM md_field_definitions f LEFT JOIN'))return {rows:[]};
  if(sql.includes('FROM md_object_record_types')||sql.includes('FROM md_object_record_type_values'))return {rows:[]};
  if(sql.includes('FROM md_object_'))return {rows:[]};
  throw new Error('Unexpected metadata query '+sql);
 },
 transaction:async(run:(client:{query:(sql:string,args:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>run({
  query:async(sql:string,args:unknown[])=>{
   if(sql.includes('SELECT object_api,api_name,id'))return {rows:[]};
   if(sql.includes('SELECT id FROM md_field_definitions'))return {rows:[{id:'f'}]};
   if(sql.includes('md_field_dependencies'))return {rows:[]};
   if(sql.includes('formula_expression'))return {rows:[]};
   if(sql.includes('UPDATE md_field_definitions SET deleted_at=now()'))softDeletes++;
   if(sql.startsWith('DELETE FROM md_field_definitions'))hardDeletes++;
   return {rows:[]};
  }
 })} as unknown as SqlPersistence;
 await new ObjectDefinitionService(db).deleteField('tenant','Sale__c','CustomerId');
 assert.equal(softDeletes,1);
 assert.equal(hardDeletes,0);
});
test('Field update rejects unsupported datatype changes before mutating values',async()=>{
 const db={query:async(sql:string)=>{
  if(sql.includes('FROM md_field_formulas'))return {rows:[]};
  if(sql.includes('FROM md_object_definitions'))return {rows:[{id:'o',api_name:'Sale__c',label:'Sale',is_system:false}]};
  if(sql.includes('FROM md_field_definitions'))return {rows:[{id:'f',object_api:'Sale__c',api_name:'Total',label:'Total',data_type:'number',related_object:null,required:false,max_length:null,precision:18,scale:0,is_unique:false,external_id:false,case_sensitive:false,default_value:null}]};
  if(sql.includes('FROM md_object_layout_versions')||sql.includes('FROM md_object_page_layout')||sql.includes('FROM md_object_record_type'))return {rows:[]};
  throw new Error('Unexpected SQL write');
 },transaction:async(run:(client:{query:(sql:string,args:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>run({
  query:async(sql:string)=>{
   if(sql.includes('FOR UPDATE'))return {rows:[{data_type:'number',max_length:null,precision:18,scale:0,required:false,is_unique:false,external_id:false,case_sensitive:false,default_value:null}]};
   return {rows:[],rowCount:0};
  }
 })} as unknown as SqlPersistence;
 await assert.rejects(()=>new ObjectDefinitionService(db).updateField('tenant','Sale__c','Total',
  {label:'Total',dataType:'Geolocation'}),/Field datatype migration is not supported/);
});

test('Rich Text fields with inline images cannot migrate to another field type',async()=>{
 let checkedForImages=false;
 const db={query:async(sql:string)=>{
  if(sql.includes('FROM md_field_formulas'))return {rows:[]};
  if(sql.includes('FROM md_object_definitions'))return {rows:[{id:'o',api_name:'Note__c',label:'Note',is_system:false}]};
  if(sql.includes('FROM md_field_definitions'))return {rows:[{id:'f',object_api:'Note__c',api_name:'Body__c',label:'Body',
    data_type:'richtext',related_object:null,required:false,max_length:131072,precision:null,scale:null,
    is_unique:false,external_id:false,case_sensitive:false,default_value:null}]};
  if(sql.includes('FROM md_object_layout_versions')||sql.includes('FROM md_object_page_layout')
    ||sql.includes('FROM md_object_record_type'))return {rows:[]};
  throw new Error('Unexpected SQL write');
 },transaction:async(run:(client:{query:(sql:string,args:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>run({
  query:async(sql:string)=>{
   if(sql.includes('FOR UPDATE'))return {rows:[{data_type:'richtext',max_length:131072,precision:null,
    scale:null,required:false,is_unique:false,external_id:false,case_sensitive:false,default_value:null}]};
   if(sql.includes('FROM md_record_files')){
    checkedForImages=true;
    return {rows:[{id:'file-1'}],rowCount:1};
   }
   return {rows:[],rowCount:0};
  }
 })} as unknown as SqlPersistence;
 await assert.rejects(()=>new ObjectDefinitionService(db).updateField('tenant','Note__c','Body__c',
  {label:'Body',dataType:'Text'}),/Inline images must be removed before migrating a Rich Text field/);
 assert.equal(checkedForImages,true);
});

test('SQL Flow draft validator rejects unsupported actions and broken branches',async()=>{
 const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const runtime=new FlowRuntime(withFlowCapabilities({} as SqlPersistence),rbac);
 const draft={
  apiName:'TestFlow',flowType:'Autolaunched Flow',
  elements:[{id:1,type:'Start'},{id:2,type:'UnsupportedWebhook'},{id:3,type:'End'}],
  connectors:[{from:1,to:2,kind:'normal'}]
 };
 const result=await runtime.validateDraft('tenant','user','TestFlow',draft);
 assert.equal(result.valid,false);
 assert.ok(result.errors.some(e=>e.includes('Unsupported SQL Flow element')));
 assert.ok(result.errors.some(e=>e.includes('No reachable End')));
 const collectionDraft={
  apiName:'TestFlow',flowType:'Autolaunched Flow',
  resources:[{name:'accounts',type:'Record Collection',dataType:'Account'}],
  elements:[
   {id:1,type:'Start',config:{}},
   {id:2,type:'Create Records',config:{recordSource:'collection',object:'Account',collection:'accounts'}},
   {id:3,type:'End',config:{}}
  ],
  connectors:[{from:1,to:2,kind:'normal'},{from:2,to:3,kind:'normal'}]
 };
 const collectionResult=await runtime.validateDraft('tenant','user','TestFlow',collectionDraft);
 assert.equal(collectionResult.valid,true,collectionResult.errors.join('; '));
});
test('SQL Flow supports bounded Update Records targets with explicit assignments',async()=>{
 const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const runtime=new FlowRuntime(withFlowCapabilities({} as SqlPersistence),rbac);
 const elements=[
  {id:1,type:'Start',config:{}},
  {id:2,type:'Update Records',config:{object:'Product',recordId:'{!recordId}',fieldValues:[{field:'Taxable',value:true}]}},
  {id:3,type:'End',config:{}}
 ];
 const draft={apiName:'TestFlow',flowType:'Autolaunched Flow',elements,
  connectors:[{from:1,to:2,kind:'normal'},{from:2,to:3,kind:'normal'}]};
 const valid=await runtime.validateDraft('tenant','user','TestFlow',draft);
 assert.equal(valid.valid,true,valid.errors.join('; '));
 const invalid=await runtime.validateDraft('tenant','user','TestFlow',{
  ...draft,elements:[elements[0],{...elements[1],config:{...elements[1].config,recordId:'',conditions:[{field:'Taxable',operator:'Equals',value:true}]}},elements[2]]
 });
 assert.equal(invalid.valid,true,invalid.errors.join('; '));
 const unbounded=await runtime.validateDraft('tenant','user','TestFlow',{
  ...draft,elements:[elements[0],{...elements[1],config:{...elements[1].config,recordId:'',conditions:[]}},elements[2]]
 });
 assert.equal(unbounded.valid,false);
 assert.ok(unbounded.errors.some(e=>e.includes('filter requires between 1 and 50 conditions')));
});
test('Flow validator requires each Decision outcome and prohibits unterminated branches',async()=>{
 const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const runtime=new FlowRuntime(withFlowCapabilities({} as SqlPersistence),rbac);
 const draft={
  apiName:'TestFlow',flowType:'Autolaunched Flow',
  elements:[
   {id:1,type:'Start',config:{}},
   {id:2,type:'Decision',config:{outcomes:[{name:'Ready',label:'Ready'},{name:'Default',label:'Default Outcome'}]}},
   {id:3,type:'End',config:{}},
   {id:4,type:'Assignment',config:{variable:'flag',value:true}}
  ],
  connectors:[{from:1,to:2,label:'',kind:'normal'},{from:2,to:3,label:'Ready',kind:'normal'},
   {from:2,to:4,label:'Default',kind:'normal'}]
 };
 const broken=await runtime.validateDraft('tenant','user','TestFlow',draft);
 assert.equal(broken.valid,false);
 assert.ok(broken.errors.some(error=>error.includes('cannot reach End from element: 4')));
 const fixed=await runtime.validateDraft('tenant','user','TestFlow',{
  ...draft,connectors:[...draft.connectors,{from:4,to:3,label:'',kind:'normal'}]
 });
 assert.equal(fixed.valid,true,fixed.errors.join('; '));
 const missing=await runtime.validateDraft('tenant','user','TestFlow',{
  ...draft,connectors:[{from:1,to:2,label:'',kind:'normal'},{from:2,to:3,label:'Ready',kind:'normal'}]
 });
 assert.ok(missing.errors.some(error=>error.includes('Decision outcome needs exactly one connector')));
 const afterEnd=await runtime.validateDraft('tenant','user','TestFlow',{
  ...draft,connectors:[...draft.connectors,{from:3,to:4,label:'',kind:'normal'}]
 });
 assert.ok(afterEnd.errors.some(error=>error.includes('End must not have outgoing')));
});
test('Record update in Flow transaction applies tenant, record, and field permissions',async()=>{
 const {RecordEngine}=await import('../../src/system-files/record-engine.js');
 const calls:Array<{sql:string;args:unknown[]}>=[],checks:string[]=[];
 const tenant='tenant-a',user='actor',recordId='11111111-1111-4111-8111-111111111111';
 const client={query:async(sql:string,args:unknown[])=>{
   if(sql.includes('FROM md_field_default_formulas')||sql.includes('FROM md_validation_rules')||sql.includes('FROM md_matching_rules'))return {rows:[],rowCount:0};
  calls.push({sql,args});
  if(sql.includes('FROM md_field_definitions'))return {rows:[{api_name:'Taxable',data_type:'boolean',related_object:null,required:false,max_length:null}],rowCount:1};
  if(sql.includes('FROM md_records WHERE'))return {rows:[{updated_at:new Date()}],rowCount:1};
  if(sql.includes('FROM md_record_values WHERE'))return {rows:[{value_text:'false',reference_record_id:null}],rowCount:1};
  return {rows:[],rowCount:1};
 }};
 const db={query:async()=>{throw Error('Transaction must use its own SQL client')},
  transaction:async()=>{throw Error('Must not open a nested transaction')}} as unknown as SqlPersistence;
 const rbac={require:async(t:string,u:string,resource:string,action:string)=>{
  assert.equal(t,tenant);assert.equal(u,user);checks.push(resource+'.'+action);
 }} as unknown as RbacEngine;
 await new RecordEngine(db,rbac).updateInTransaction(client as any,tenant,user,'Product',recordId,{Taxable:true});
 assert.deepEqual(checks,['Product.edit','Product.Taxable.edit']);
 assert.ok(calls.some(call=>call.sql.includes('md_record_access')&&call.args[0]===tenant&&call.args[3]===user));
 assert.ok(calls.some(call=>call.sql.includes('INSERT INTO md_record_history')&&call.args[0]===tenant));
 assert.ok(calls.some(call=>call.sql.includes('INSERT INTO md_record_values')&&call.args[0]===tenant));
});
test('SQL Flow validation fails closed without permission',async()=>{
 const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
 const rbac={require:async()=>{throw new Error('Permission denied')}} as unknown as RbacEngine;
 await assert.rejects(()=>new FlowRuntime({} as SqlPersistence,rbac).validateDraft('tenant','user','TestFlow',{}),/Permission denied/);
});

test('Flow interview cancellation preserves tenant scope and durable run row',async()=>{
 const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
 const checks:unknown[][]=[];
 const db={transaction:async(run:(client:{query:(sql:string,args:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>
  run({query:async(sql:string,args:unknown[])=>{
   checks.push(args);
   if(sql.includes('UPDATE md_flow_runs')){
    assert.match(sql,/status='cancelled'/);
    assert.match(sql,/status IN \('pending','waiting'\)/);
    return {rowCount:1,rows:[{id:args[1]}]};
   }
   assert.match(sql,/md_flow_approval_stages|md_approval_requests|job_type='flow.resume'/);
   assert.match(sql,/tenant_id=\$1/);
   return {rowCount:1,rows:[]};
  }})
 } as unknown as SqlPersistence;
 const rbac={require:async(t:string,u:string,r:string,a:string)=>{
  assert.deepEqual([t,u,r,a],['tenant','user','FlowDefinition','manage']);
 }} as unknown as RbacEngine;
 const id='c439f882-7316-4cf1-86fb-81d95b135c97';
 const value=await new FlowRuntime(db,rbac).cancelInterview('tenant','user',id);
 assert.equal(value.cancelled,true);
 assert.equal(checks.length,5);
 assert.ok(checks.every(args=>JSON.stringify(args)===JSON.stringify(['tenant',id])));
});
test('Flow interview cancellation rejects unauthorised or malformed requests',async()=>{
 const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
 const db={query:async()=>{throw new Error('Should not write SQL')}} as unknown as SqlPersistence;
 const denied={require:async()=>{throw new Error('Permission denied')}} as unknown as RbacEngine;
 await assert.rejects(()=>new FlowRuntime(db,denied).cancelInterview('tenant','user','c439f882-7316-4cf1-86fb-81d95b135c97'),/Permission denied/);
 await assert.rejects(()=>new FlowRuntime(db,denied).cancelInterview('tenant','user','not-an-id'),/Invalid interview ID/);
});

test('App removal clears installation and home bindings and cancels pending jobs',async()=>{
 const {AppRuntime}=await import('../../src/system-files/app-runtime.js');
 const queries:Array<{sql:string;args:unknown[]}>= [];
 const db={transaction:async(run:(client:{query:(sql:string,args:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>
   run({query:async(query:string,args:unknown[])=>{
     queries.push({sql:query,args});
     assert.ok(!query.includes('md_records'));
     assert.ok(!query.includes('md_record_values'));
     if(query.includes('SELECT a.id,a.api_name FROM md_apps'))
       return {rowCount:1,rows:[{id:'app-id',api_name:'MarketplaceApp'}]};
     if(query.includes('FROM md_app_package_dependencies d'))
       return {rowCount:0,rows:[]};
     return {rowCount:1,rows:[]};
   }})
 } as unknown as SqlPersistence;
 await new AppRuntime(db).uninstall('tenant','MarketplaceApp');
 assert.deepEqual(queries[0].args,['tenant:app-lifecycle']);
 assert.deepEqual(queries[1].args,['tenant','MarketplaceApp']);
 assert.deepEqual(queries[2].args,['tenant','app-id']);
 assert.deepEqual(queries[3].args,['tenant','MarketplaceApp','MarketplaceApp']);
 assert.ok(queries.some(({sql})=>sql.includes('md_durable_jobs')&&sql.includes("status='cancelled'")));
 assert.ok(queries.some(({sql})=>sql.includes('DELETE FROM md_app_installations')));
 assert.ok(queries.some(({sql})=>sql.includes('DELETE FROM md_app_home_pages')));
});

test('Tenant route aliases are revisioned and resolve only installed app targets',async()=>{
 const {AppRuntime}=await import('../../src/system-files/app-runtime.js');
 const queries:Array<{sql:string;args:unknown[]}>=[],db={
  query:async(sql:string,args:unknown[])=>{
    queries.push({sql,args});
    if(sql.includes('FROM md_apps a')&&sql.includes('md_app_installations'))return {rows:[{id:'app'}]};
    if(sql.includes('FROM md_object_definitions'))return {rows:[{id:'object'}]};
    if(sql.includes('INSERT INTO md_app_route_aliases'))return {rows:[{version:1}],rowCount:1};
    if(sql.includes('UPDATE md_app_route_aliases'))return {rows:[],rowCount:1};
    if(sql.includes('SELECT r.kind,r.target_api'))return {rows:[{kind:'Record List',target_api:'Customer__c'}]};
    return {rows:[],rowCount:0};
  }
 } as unknown as SqlPersistence;
 const apps=new AppRuntime(db);
 await assert.rejects(()=>apps.saveAlias('tenant','MyApp','customers',{appId:'MyApp',slug:'customers',
   kind:'Record List',targetApiName:'Customer__c',expectedVersion:-1}),/Invalid route alias/);
 const saved=await apps.saveAlias('tenant','MyApp','customers',{appId:'MyApp',slug:'customers',
   kind:'Record List',targetApiName:'Customer__c',expectedVersion:0});
 assert.equal(saved.version,1);
 const resolution=await apps.resolveAlias('tenant','MyApp','customers');
 assert.match(resolution.path,/^\/une\/o\/Customer__c\/list\?/);
 await apps.disableAlias('tenant','MyApp','customers',1);
 assert.ok(queries.every(query=>query.args[0]==='tenant'));
 assert.ok(queries.some(query=>query.sql.includes('version=$4')&&query.sql.includes("status='Active'")));
});

test('SQL picklist field creation persists validated options and rejects invalid values',async()=>{
  const writes:Array<{sql:string;args:unknown[]}>= [];
  const client={query:async(sql:string,args:unknown[])=>{
   if(sql.includes('FROM md_field_default_formulas')||sql.includes('FROM md_validation_rules')||sql.includes('FROM md_matching_rules'))return {rows:[],rowCount:0};
    writes.push({sql,args});
    if(sql.includes('pg_advisory_xact_lock_shared'))return {rows:[],rowCount:1};
    if(sql.includes("data_type='autonumber'")||sql.includes("data_type='rollup'"))return {rows:[],rowCount:0};
    if(sql.includes('FROM md_field_definitions'))return {rows:[{
      api_name:'Status',data_type:'picklist',related_object:null,required:false,max_length:null,
      precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,
      default_value:null,auto_number_format:null,picklist_restricted:true
    }],rowCount:1};
    if(sql.includes('FROM md_field_picklist_values'))return {rows:[{value:'Approved'},{value:'Rejected'}],rowCount:2};
    if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
    return {rows:[{id:'created'}],rowCount:1};
  }};
  const db={
    query:async(sql:string,args:unknown[])=>{
      if(sql.includes('FROM md_field_definitions'))return {rows:[{
        api_name:'Status',data_type:'picklist',related_object:null,required:false,max_length:null,picklist_restricted:true
      }]};
      if(sql.includes('FROM md_field_picklist_values'))return {rows:[{value:'Approved'}],rowCount:args[3]==='Approved'?1:0};
      if(sql.includes('FROM md_object_record_types'))return {rows:[]};
      throw new Error('Unexpected SQL '+sql);
    },
    transaction:async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client)
  } as unknown as SqlPersistence;
  const service=new ObjectDefinitionService(db);
  await service.addField('tenant','Sale__c','Status','Picklist',undefined,'Status',
    {picklistValues:['Approved','Rejected'],picklistRestricted:true});
  assert.equal(writes.filter(item=>item.sql.includes('INSERT INTO md_field_picklist_values')).length,2);
  const {RecordEngine}=await import('../../src/system-files/record-engine.js');
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const records=new RecordEngine(db,rbac);
  await assert.rejects(()=>records.create('tenant','user','Sale__c',{Status:'Not Configured'}),/Invalid picklist value/);
  assert.equal(await records.create('tenant','user','Sale__c',{Status:'Approved'}),'created');
});
test('SQL object creation rejects picklists with no selectable values before transaction',async()=>{
  const db={transaction:async()=>{throw new Error('Unexpected transaction')}} as unknown as SqlPersistence;
  await assert.rejects(()=>new ObjectDefinitionService(db).create('tenant','Sale__c','Sale',[
    {apiName:'Status',label:'Status',dataType:'Picklist',picklistValues:[]}
  ]),/Invalid picklist values/);
});
test('SQL field creation persists numeric, relationship and builder field metadata',async()=>{
  const writes:Array<{sql:string;args:unknown[]}>= [];
  const client={query:async(sql:string,args:unknown[])=>{
    if(sql.includes('SELECT f.data_type,f.formula_return_type'))
      return {rows:[{data_type:'currency',formula_return_type:null,rollup_source_type:null}],rowCount:1};
    if(sql.includes('WITH RECURSIVE parent_chain'))return {rows:[],rowCount:0};
    if(sql.includes('count(*)::integer AS total'))return {rows:[{total:0}],rowCount:1};
    writes.push({sql,args});return {rows:[{id:'field'}],rowCount:1};
  }};
  const db={transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
  const definitions=new ObjectDefinitionService(db);
  await definitions.addField('tenant','Invoice__c','Amount','Currency(16, 2)',undefined,'Amount',{
    required:true,unique:true,externalId:true,caseSensitive:true,defaultValue:12.5,
    helpText:'Invoice value',description:'Net value'
  });
  await definitions.addField('tenant','Invoice__c','AccountId','Master-Detail(Account)',undefined,'Account',{
    relationship:{type:'Master-Detail',targetObject:'Account'}
  });
  await definitions.addField('tenant','Invoice__c','Tags','Multi-Select Picklist',undefined,'Tags',{
    picklistValues:['Urgent','Review']
  });
  await definitions.addField('tenant','Invoice__c','Location','Geolocation');
  await definitions.addField('tenant','Invoice__c','Serial','AutoNumber',undefined,'Serial',{
    autoNumberFormat:'INV-{0000}'
  });
  await definitions.addField('tenant','Invoice__c','Calculated','Formula(Number)',undefined,'Calculated',{
    formula:{expression:'@Invoice__c.Amount * 2',returnType:'Number'}
  });
  const amount=writes.find(item=>item.sql.includes('INSERT INTO md_field_definitions'));
  assert.ok(amount);
  assert.deepEqual(amount.args.slice(3,7),['currency',null,null,'Amount']);
  assert.deepEqual(amount.args.slice(8,21),[
    true,null,true,true,true,'12.5','Invoice value','Net value',16,2,null,null,null
  ]);
  const relationship=writes.filter(item=>item.sql.includes('INSERT INTO md_field_definitions'))[1];
  assert.deepEqual(relationship.args.slice(3,6),['reference','Account',null]);
  assert.equal(relationship.args[9],'Master-Detail');
  assert.equal(relationship.args[8],true);
  assert.equal(writes.filter(item=>item.sql.includes('INSERT INTO md_field_definitions'))[2].args[3],'multipicklist');
  assert.equal(writes.filter(item=>item.sql.includes('INSERT INTO md_field_definitions'))[3].args[3],'geolocation');
  const autoNumber=writes.filter(item=>item.sql.includes('INSERT INTO md_field_definitions'))[4];
  assert.equal(autoNumber.args[3],'autonumber');
  assert.equal(autoNumber.args[20],'INV-{0000}');
  const formula=writes.filter(item=>item.sql.includes('INSERT INTO md_field_definitions'))[5];
  assert.equal(formula.args[3],'formula');
  assert.equal(formula.args[18],'@Invoice__c.Amount * 2');
  assert.equal(formula.args[19],'Number');
});
test('dependent picklist metadata is persisted relationally and validates controller combinations',async()=>{
  const writes:Array<{sql:string;args:unknown[]}>= [];
  const client={query:async(sql:string,args:unknown[])=>{
    writes.push({sql,args});
    if(sql.includes('SELECT data_type FROM md_field_definitions'))
      return {rows:[{data_type:'boolean'}],rowCount:1};
    if(sql.includes('SELECT value FROM md_field_picklist_values'))
      return {rows:[],rowCount:0};
    return {rows:[{id:'field'}],rowCount:1};
  }};
  const db={transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
  await new ObjectDefinitionService(db).addField('tenant','Lead__c','Status','Picklist',undefined,'Status',{
    picklistValues:['New','Qualified'],controllerFieldApiName:'IsActive',
    valueSettings:{true:['Qualified'],false:['New']}
  });
  assert.deepEqual(writes.find(item=>item.sql.includes('INSERT INTO md_field_dependencies'))?.args,
    ['tenant','Lead__c','Status','IsActive']);
  assert.equal(writes.filter(item=>item.sql.includes('INSERT INTO md_field_dependency_values')).length,2);
});
test('field updates replace dependent picklist mappings without losing tenant metadata',async()=>{
  const writes:Array<{sql:string;args:unknown[]}>= [];
  const client={query:async(sql:string,args:unknown[])=>{
    writes.push({sql,args});
    if(sql.includes('SELECT data_type FROM md_field_definitions'))return {rows:[{data_type:'picklist'}],rowCount:1};
    if(sql.includes('SELECT value FROM md_field_picklist_values'))return {rows:[{value:'Open'},{value:'Closed'}],rowCount:2};
    if(sql.includes('controller.value_text AS controller_value'))return {rows:[],rowCount:0};
    if(sql.includes('UPDATE md_field_definitions'))return {rows:[{id:'field'}],rowCount:1};
    return {rows:[],rowCount:1};
  }};
  const db={
    transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client),
    query:async(sql:string)=>{
      if(sql.includes('FROM md_object_definitions'))return {rows:[{
        id:'object',api_name:'Lead__c',label:'Lead',is_system:false
      }],rowCount:1};
      if(sql.includes('FROM md_field_definitions f LEFT JOIN md_field_dependencies'))return {rows:[
        {id:'field',object_api:'Lead__c',api_name:'Status',label:'Status',data_type:'picklist',
          related_object:null,relationship_type:null,required:false,max_length:null,precision:null,scale:null,
          is_unique:false,external_id:false,case_sensitive:false,default_value:null,help_text:null,
          description:null,formula_expression:null,formula_return_type:null,auto_number_format:null,
          picklist_restricted:true,controller_field_api_name:'Stage'},
        {id:'controller',object_api:'Lead__c',api_name:'Stage',label:'Stage',data_type:'picklist',
          related_object:null,relationship_type:null,required:false,max_length:null,precision:null,scale:null,
          is_unique:false,external_id:false,case_sensitive:false,default_value:null,help_text:null,
          description:null,formula_expression:null,formula_return_type:null,auto_number_format:null,
          picklist_restricted:true,controller_field_api_name:null}
      ],rowCount:2};
      if(sql.includes('FROM md_field_picklist_values'))return {rows:[
        {object_api:'Lead__c',field_api:'Status',value:'A'},
        {object_api:'Lead__c',field_api:'Status',value:'B'},
        {object_api:'Lead__c',field_api:'Stage',value:'Open'},
        {object_api:'Lead__c',field_api:'Stage',value:'Closed'}
      ],rowCount:4};
      if(sql.includes('FROM md_field_dependency_values'))return {rows:[
        {object_api:'Lead__c',field_api:'Status',controller_value:'Open',picklist_value:'A'}
      ],rowCount:1};
      if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
      if(/FROM md_[a-z_]+ WHERE tenant_id=\$1/.test(sql))return {rows:[],rowCount:0};
      throw new Error('Unexpected metadata query '+sql);
    }
  } as unknown as SqlPersistence;
  const updated=await new ObjectDefinitionService(db).updateField('tenant','Lead__c','Status',{
    apiName:'Status',label:'Status',dataType:'Picklist',required:false,unique:false,
    picklistValues:['A','B'],picklistRestricted:true,controllerFieldApiName:'Stage',
    valueSettings:{Open:['B'],Closed:[]}
  });
  assert.equal(updated.fields.find(field=>field.apiName==='Status')?.controllerFieldApiName,'Stage');
  assert.ok(writes.some(call=>call.sql.includes('INSERT INTO md_field_dependency_values')
    &&call.args[3]==='Open'&&call.args[4]==='B'));
  assert.ok(writes.some(call=>call.sql.includes('DELETE FROM md_field_dependencies')));
});
test('dependent picklist values are enforced during record creation',async()=>{
  const definitions=[
    {api_name:'IsActive',data_type:'boolean',related_object:null,required:false,max_length:null,
      precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,default_value:null,
      auto_number_format:null,picklist_restricted:true,controller_field_api_name:null},
    {api_name:'Status',data_type:'picklist',related_object:null,required:false,max_length:null,
      precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,default_value:null,
      auto_number_format:null,picklist_restricted:true,controller_field_api_name:'IsActive'}
  ];
  const insertValues:Array<{field:string;value:string|null}>= [];
  const client={query:async(sql:string,args:unknown[])=>{
   if(sql.includes('FROM md_field_default_formulas')||sql.includes('FROM md_validation_rules')||sql.includes('FROM md_matching_rules'))return {rows:[],rowCount:0};
    if(sql.includes('pg_advisory_xact_lock_shared'))return {rows:[],rowCount:1};
    if(sql.includes('FROM md_field_definitions LEFT JOIN'))return {rows:definitions,rowCount:definitions.length};
    if(sql.includes('FROM md_field_picklist_values'))return {rows:[{value:'New'},{value:'Qualified'}],rowCount:2};
    if(sql.includes('FROM md_field_dependency_values'))return args[3]==='true'
      ?{rows:[{picklist_value:'Qualified'}],rowCount:1}:{rows:[],rowCount:0};
    if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO md_records'))return {rows:[{id:'created'}],rowCount:1};
    if(sql.includes("data_type='autonumber'"))return {rows:[],rowCount:0};
    if(sql.includes("data_type='rollup'"))return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO md_record_values')){
      insertValues.push({field:String(args[3]),value:args[4] as string|null});
      return {rows:[],rowCount:1};
    }
    throw new Error('Unexpected transactional query '+sql);
  }};
  const db={
    query:async(sql:string,args:unknown[])=>{
      if(sql.includes('FROM md_field_definitions'))return {rows:definitions,rowCount:definitions.length};
      if(sql.includes('FROM md_field_picklist_values'))return {rows:[{value:'New'},{value:'Qualified'}],rowCount:1};
      if(sql.includes('FROM md_field_dependency_values'))
        return args[3]==='true'&&String(args[4]).includes('Qualified')
          ?{rows:[{picklist_value:'Qualified'}],rowCount:1}:{rows:[],rowCount:0};
      if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
      throw new Error('Unexpected query '+sql);
    },
    transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)
  } as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const records=new (await import('../../src/system-files/record-engine.js')).RecordEngine(db,rbac);
  await assert.rejects(()=>records.create('tenant','user','Lead__c',{IsActive:true,Status:'New'}),
    /Invalid dependent picklist value/);
  assert.equal(await records.create('tenant','user','Lead__c',{IsActive:true,Status:'Qualified'}),'created');
  assert.ok(insertValues.some(row=>row.field==='Status'&&row.value==='Qualified'));
});
test('numeric fields round to their configured scale before saving',async()=>{
  const savedValues:string[]=[];
  const definitions=[{
    api_name:'Amount',data_type:'number',related_object:null,required:false,max_length:null,
    precision:5,scale:2,is_unique:false,external_id:false,case_sensitive:false,default_value:null,
    auto_number_format:null
  }];
  const client={query:async(sql:string,args:unknown[])=>{
   if(sql.includes('FROM md_field_default_formulas')||sql.includes('FROM md_validation_rules')||sql.includes('FROM md_matching_rules'))return {rows:[],rowCount:0};
    if(sql.includes('pg_advisory_xact_lock_shared'))return {rows:[],rowCount:1};
    if(sql.includes('FROM md_field_definitions LEFT JOIN'))return {rows:definitions,rowCount:1};
    if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO md_records'))return {rows:[{id:'created'}],rowCount:1};
    if(sql.includes("data_type='autonumber'"))return {rows:[],rowCount:0};
    if(sql.includes("data_type='rollup'"))return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO md_record_values')){
      savedValues.push(String(args[4]));
      return {rows:[],rowCount:1};
    }
    throw new Error('Unexpected transactional query '+sql);
  }};
  const db={
    query:async(sql:string)=>{
      if(sql.includes('FROM md_field_definitions'))return {rows:definitions,rowCount:1};
      if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
      throw new Error('Unexpected query '+sql);
    },
    transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)
  } as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const records=new (await import('../../src/system-files/record-engine.js')).RecordEngine(db,rbac);
  await records.create('tenant','user','Invoice__c',{Amount:1.235});
  await records.create('tenant','user','Invoice__c',{Amount:-1.235});
  assert.equal(savedValues[0],'1.24');
  assert.equal(savedValues[1],'-1.24');
  await assert.rejects(()=>records.create('tenant','user','Invoice__c',{Amount:999.995}),
    /Number exceeds field precision or scale/);
});
test('long text fields enforce Salesforce maximum length',async()=>{
  const db={query:async(sql:string)=>{
    if(sql.includes('FROM md_field_definitions'))return {rows:[{
      api_name:'Details',data_type:'longtext',related_object:null,required:false,max_length:131072,
      precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,default_value:null,
      auto_number_format:null
    }],rowCount:1};
    throw new Error('Unexpected query '+sql);
  }} as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const records=new (await import('../../src/system-files/record-engine.js')).RecordEngine(db,rbac);
  await assert.rejects(()=>records.create('tenant','user','Note__c',{Details:'x'.repeat(131073)}),
    /Invalid text length/);
});
test('new long text fields default to Salesforce long text capacity',async()=>{
  const calls:Array<{sql:string;args:unknown[]}>= [];
  const client={query:async(sql:string,args:unknown[])=>{
    calls.push({sql,args});return {rows:[{id:'field'}],rowCount:1};
  }};
  const db={transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
  await new ObjectDefinitionService(db).addField('tenant','Note__c','Details','Long Text Area',undefined,'Details');
  assert.equal(calls.find(call=>call.sql.includes('INSERT INTO md_field_definitions'))?.args[5],131072);
});
test('phone fields accept formatted numbers and reject malformed input',async()=>{
  const db={query:async(sql:string)=>sql.includes('FROM md_field_definitions')
    ?{rows:[{api_name:'Phone',data_type:'phone',related_object:null,required:false,max_length:40,
      precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,default_value:null,
      auto_number_format:null}],rowCount:1}
    :{rows:[],rowCount:0}} as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const records=new (await import('../../src/system-files/record-engine.js')).RecordEngine(db,rbac);
  await assert.rejects(()=>records.create('tenant','user','Contact__c',{Phone:'call me'}),
    /Invalid phone field/);
});
test('auto-number fields substitute both sequence and year tokens',async()=>{
  let saved:string|undefined;
  const client={query:async(sql:string,args:unknown[])=>{
   if(sql.includes('FROM md_field_default_formulas')||sql.includes('FROM md_validation_rules')||sql.includes('FROM md_matching_rules'))return {rows:[],rowCount:0};
    if(sql.includes('pg_advisory_xact_lock_shared'))return {rows:[],rowCount:1};
    if(sql.includes('FROM md_field_definitions LEFT JOIN'))return {rows:[{
      api_name:'Number',data_type:'autonumber',related_object:null,required:true,max_length:null,
      precision:null,scale:null,is_unique:true,external_id:false,case_sensitive:false,
      default_value:null,auto_number_format:'INV-{YYYY}-{0000}'
    }],rowCount:1};
    if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO md_records'))return {rows:[{id:'created'}],rowCount:1};
    if(sql.includes("data_type='autonumber'"))return {rows:[{
      api_name:'Number',auto_number_format:'INV-{YYYY}-{0000}',is_unique:false,external_id:false,case_sensitive:false
    }],rowCount:1};
    if(sql.includes("data_type='rollup'"))return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO md_auto_number_counters'))return {rows:[{sequence:'17'}],rowCount:1};
    if(sql.includes('INSERT INTO md_record_values')){saved=String(args[4]);return {rows:[],rowCount:1};}
    throw new Error('Unexpected transactional query '+sql);
  }};
  const db={
    query:async(sql:string)=>sql.includes('FROM md_field_definitions')
      ?{rows:[{api_name:'Number',data_type:'autonumber',related_object:null,required:false,max_length:null,
        precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,default_value:null,
        auto_number_format:'INV-{YYYY}-{0000}'}],rowCount:1}
      :{rows:[],rowCount:0},
    transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)
  } as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  await new (await import('../../src/system-files/record-engine.js')).RecordEngine(db,rbac)
    .create('tenant','user','Invoice__c',{});
  assert.match(saved??'',new RegExp(`^INV-${new Date().getUTCFullYear()}-0017$`));
});
test('numeric filters compare numeric values rather than their text representation',async()=>{
  const queries:string[]=[];
  const db={query:async(sql:string)=>{
    queries.push(sql);
    if(sql.includes('FROM md_field_definitions'))return {rows:[{
      api_name:'Amount',data_type:'number',related_object:null,required:false,max_length:null,
      precision:12,scale:2,is_unique:false,external_id:false,case_sensitive:false,default_value:null,
      auto_number_format:null
    }],rowCount:1};
    if(sql.includes('WITH authorized AS MATERIALIZED'))return {rows:[],rowCount:0};
    throw new Error('Unexpected query '+sql);
  }} as unknown as SqlPersistence;
  const rbac={require:async()=>{},allowed:async()=>true} as unknown as RbacEngine;
  await new (await import('../../src/system-files/record-engine.js')).RecordEngine(db,rbac)
    .list('tenant','user','Invoice__c',10,0,{filterField:'Amount',filterValue:'1.20'});
  assert.ok(queries.some(sql=>/fv\.value_text::numeric=\$\d+::numeric/.test(sql)));
});
test('Record list applies authorised sort, search and field filters before pagination',async()=>{
  const sqlCalls:Array<{sql:string;args:unknown[]}>= [];
  const db={query:async(sql:string,args:unknown[])=>{
    sqlCalls.push({sql,args});
    if(sql.includes('SELECT api_name,data_type,related_object'))return {rows:[
      {api_name:'Name',data_type:'text',related_object:null,required:false,max_length:80},
      {api_name:'Amount',data_type:'number',related_object:null,required:false,max_length:null}
    ]};
    if(sql.includes('FROM md_search_layout_fields search_fields'))return {rows:[{field_api:'Name'}]};
    if(sql.includes('WITH authorized AS MATERIALIZED'))return {rows:[{
      id:null,total_count:'1',field_api:null,value_text:null,reference_record_id:null,
      value_number:null,value_date:null,value_datetime:null,value_boolean:null,
      geo_latitude:null,geo_longitude:null,address_street:null,address_city:null,address_state:null,
      address_postal_code:null,address_country:null,data_type:null,
    }]};
    throw new Error('Unexpected list query '+sql);
  }} as unknown as SqlPersistence;
  const rbac={require:async()=>{},allowed:async()=>true} as unknown as RbacEngine;
  const result=await new (await import('../../src/system-files/record-engine.js')).RecordEngine(db,rbac)
    .list('tenant','user','Invoice__c',25,0,{
      sortField:'Amount',sortDirection:'desc',search:'Acme',filterField:'Name',filterValue:'Acme Ltd'
    });
  assert.deepEqual(result,{records:[],total:1});
  const list=sqlCalls.find(item=>item.sql.includes('WITH authorized AS MATERIALIZED'));
  assert.ok(list);
  assert.match(list.sql,/sv\.value_number DESC NULLS LAST/);
  assert.match(list.sql,/fv\.field_api=\$4/);
  assert.match(list.sql,/qv\.search_vector @@ websearch_to_tsquery/);
  assert.equal((list.sql.match(/md_record_access\(/g)??[]).length,1);
  assert.deepEqual(list.args.slice(-2),[25,0]);
  assert.ok(list.args.includes('Amount'));
  assert.ok(list.args.includes('Acme Ltd'));
  assert.ok(list.args.includes('Acme'));
});
