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
  const db={
    query:async(sql:string)=>{
      if(sql.includes('FROM md_sessions s JOIN md_users'))return {rows:[{tenant_id:'tenant',user_id:'user'}]};
      if(sql.includes('md_permission_rules'))return {rows:[{ordinal:1,allow_granted:true,deny_granted:false}]};
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
    assert.ok(sql.includes('md_role_permission_sets'));
    assert.ok(sql.includes('md_permission_rules'));
    assert.equal(params[0],'tenant');
    assert.equal(params[1],'developer');
    assert.equal((params[2] as string[]).length,8);
    return {rows:[
      {ordinal:1,allow_granted:true,deny_granted:false},
      {ordinal:2,allow_granted:true,deny_granted:false},
      {ordinal:4,allow_granted:true,deny_granted:true}
    ]};
  }} as unknown as SqlPersistence;
  const result=await sessionMetadata(db,'tenant','developer');
  assert.equal(result.user.id,'developer');
  assert.equal(result.user.tenantId,'tenant');
  assert.deepEqual(result.user.permissions,['metadata:read','metadata:write']);
  assert.deepEqual(result.user.fieldAccess,{});
});
test('Setup /auth/me returns the authenticated SQL policy, not an empty permission response',async()=>{
  const {createSystemServer}=await import('../../src/system-support/server.js');
  const db={query:async(sql:string)=>{
    if(sql.includes('FROM md_sessions s JOIN md_users'))
      return {rows:[{tenant_id:'tenant',user_id:'developer'}]};
    if(sql.includes('md_permission_rules'))
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
    assert.equal(response.status,200);
    const json=await response.json() as {user?:{id:string;permissions:string[]}};
    assert.equal(json.user?.id,'developer');
    assert.ok(json.user?.permissions.includes('metadata:read'));
  }finally {
    if(listener.listening)await new Promise<void>((resolve,reject)=>listener.close(error=>error?reject(error):resolve()));
  }
});

test('SQL RBAC metadata endpoint exposes tenant-only policy definitions',async()=>{
 const calls:string[]=[];
 const db={query:async(sql:string,args:unknown[])=>{
  calls.push(sql);
  assert.equal(args[0],'tenant');
  if(sql.includes('WITH assigned AS'))return {rows:[{ordinal:1,allow_granted:true,deny_granted:false}]};
  if(sql.includes('FROM md_permission_sets'))return {rows:[{id:'ps1',api_name:'TenantDeveloper'}]};
  if(sql.includes('FROM md_roles'))return {rows:[{id:'r1',api_name:'Developer',label:'Developer',parent_role_id:null}]};
  if(sql.includes('FROM md_permission_rules'))return {rows:[{permission_set_id:'ps1',resource:'ObjectDefinition',action:'read',effect:'allow'}]};
  if(sql.includes('FROM md_users'))return {rows:[{id:'u1',email:'dev@example.invalid'}]};
  throw new Error('Unexpected SQL');
 }} as unknown as SqlPersistence;
 const result=await new RbacEngine(db).describe('tenant','user');
 assert.equal(result.tenantId,'tenant');
 assert.equal(result.permissionSets[0].apiName,'TenantDeveloper');
 assert.deepEqual(result.permissionSets[0].systemPermissions,['ObjectDefinition:read']);
 assert.equal(result.roles[0].name,'Developer');
 assert.equal(result.users[0].username,'dev@example.invalid');
 assert.ok(calls.every(query=>query.includes('tenant_id=$1')||query.includes('r.tenant_id=$1')));
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
   if(sql.includes('FROM md_object_definitions'))return {rows:[{id:'o1',api_name:'Sale__c',label:'Sale',is_system:false}]};
   if(sql.includes('SELECT id,object_api,api_name'))return {rows:[{id:'f1',object_api:'Sale__c',api_name:'CustomerId',label:'Customer',data_type:'reference',related_object:'Customer__c',required:false,max_length:null}]};
   if(sql.includes('SELECT object_api,related_object'))return {rows:[{object_api:'Sale__c',related_object:'Customer__c'}]};
   if(sql.includes('SELECT api_name,related_object'))return {rows:[{api_name:'CustomerId',related_object:'Customer__c'}]};
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
   assert.match(sql,/status='pending'/);
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
   CredentialName__c:'',Installed__c:true,LicenceStatus__c:'ACTIVE'}]);
});

test('Flow deactivation changes SQL state only for caller tenant and requires OneEngine manage',async()=>{
 const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
 const calls:unknown[][]=[];
 const db={query:async(sql:string,args:unknown[])=>{
  calls.push(args);
  if(sql.includes('UPDATE md_flow_definitions')){
   assert.match(sql,/tenant_id=\$1/);return {rows:[],rowCount:1};
  }
  if(sql.includes('SELECT id,api_name,label,flow_type')){
   return {rows:[{id:'f1',api_name:'MyFlow',label:'My Flow',flow_type:'Autolaunched Flow',version:2,active:false}]};
  }
  throw Error('Unexpected SQL');
 }} as unknown as SqlPersistence;
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

test('Flow draft validator enforces OneEngine permission and fails closed on unsupported shapes',async()=>{
  const {FlowRuntime}=await import('../../src/system-files/flow-runtime.js');
  const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{
    assert.equal(resource,'FlowDefinition');assert.equal(action,'manage');
  }} as unknown as RbacEngine;
  const flow=new FlowRuntime({} as SqlPersistence,rbac);
  const bad=await flow.validateDefinition('tenant','developer','ExampleFlow',{apiName:'ExampleFlow',nodes:[
    {apiName:'Start',type:'Start'},{apiName:'Start',type:'End'}
  ]});
  assert.equal(bad.valid,false);
  assert.ok(bad.errors.some(e=>e.includes('unique')));
  const good=await flow.validateDefinition('tenant','developer','ExampleFlow',{apiName:'ExampleFlow',nodes:[
    {apiName:'Start',type:'Start'},{apiName:'End',type:'End'}
  ]});
  assert.equal(good.valid,true);
});

test('Field update preserves type and validates required values transactionally',async()=>{
 const sql:string[]=[];
 const db={
   transaction:async(run:(client:{query:(sql:string,args:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>
     run({query:async(q:string,args:unknown[])=>{
       sql.push(q);
       if(q.includes('SELECT data_type,related_object,max_length'))return {rows:[
         {data_type:'text',related_object:null,max_length:80,required:false,label:'Name'}
       ]};
       if(q.includes('SELECT EXISTS'))return {rows:[{exists:true}]};
       return {rows:[],rowCount:1};
     }}),
   query:async(q:string)=>q.includes('FROM md_object_definitions')
     ?{rows:[{id:'object1',api_name:'Sale__c',label:'Sale',is_system:false}]}
     :{rows:[{id:'field1',object_api:'Sale__c',api_name:'Name',label:'Name',data_type:'text',related_object:null,required:false,max_length:80}]}
 } as unknown as SqlPersistence;
 const service=new ObjectDefinitionService(db);
 await assert.rejects(
   ()=>service.updateField('tenant','Sale__c','Name',{apiName:'Name',dataType:'Number'}),
   /explicit migration/);
 await assert.rejects(
   ()=>service.updateField('tenant','Sale__c','Name',{apiName:'Name',required:true}),
   /missing values/);
 assert.equal(sql.filter(q=>q.includes('UPDATE md_field_definitions')).length,0);
 const result=await service.updateField('tenant','Sale__c','Name',{apiName:'Name',label:'Sales name'});
 assert.equal(result.apiName,'Sale__c');
 assert.equal(sql.filter(q=>q.includes('UPDATE md_field_definitions')).length,1);
});
test('Field delete refuses data loss when business values exist',async()=>{
 const sql:string[]=[];
 const db={
   transaction:async(run:(client:{query:(q:string,args:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>
     run({query:async(q:string,args:unknown[])=>{
       sql.push(q);assert.equal(args[0],'tenant');
       if(q.includes('SELECT id FROM md_field_definitions'))return {rows:[{id:'field1'}]};
       if(q.includes('SELECT EXISTS'))return {rows:[{exists:true}]};
       return {rows:[],rowCount:1};
     }})
 } as unknown as SqlPersistence;
 await assert.rejects(
   ()=>new ObjectDefinitionService(db).deleteField('tenant','Sale__c','Name'),
   /business records/);
 assert.equal(sql.filter(q=>q.startsWith('DELETE')).length,0);
});
