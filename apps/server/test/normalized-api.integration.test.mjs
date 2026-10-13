// End-to-end MetaDrive API smoke: legacy bootstrap -> verified relational copy
// -> login, dynamic metadata, related records and Flow -> restart -> persistence.
// Strictly local, disposable databases; never accesses live provider databases.
import test from 'node:test';
import {initializeNormalizedState,readNormalizedState} from '../src/normalized-state-runtime.mjs';
import {synchronizeTypedRecords,verifyTypedRecords} from '../src/normalized-typed-records.mjs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn,spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { existsSync,mkdtempSync,readFileSync,rmSync } from 'node:fs';
import { join,dirname,resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const base=process.env.METADRIVE_TEST_DATABASE_URL;
const require=createRequire(import.meta.url);
const tsx=require.resolve('tsx/cli');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function freePort() {
  const server=createServer();
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  const addr=server.address();
  const port=addr.port;
  await new Promise(resolve=>server.close(resolve));
  return port;
}
async function startApi(port,dataPath,options={}) {
  const env={
    ...process.env,
    NODE_ENV:'test',
    PGSSLMODE:'disable',
    PORT:String(port),
    METADRIVE_DATA_PATH:dataPath,
    METADRIVE_SCHEDULE_POLL_MS:'3600000',
    METADRIVE_CREDENTIAL_KEYS:JSON.stringify({'integration-key':Buffer.alloc(32,7).toString('base64')}),
    METADRIVE_CREDENTIAL_ACTIVE_KEY_ID:'integration-key',
    ...options
  };
  delete env.NODE_OPTIONS; // No CI-only preload; runtime must exercise PostgreSQL.
  // Test the emitted production server for relational mode, not only the TS dev server.
  const entry=['relational','normalized','typed'].includes(options.METADRIVE_PERSISTENCE_MODE)?['dist/index.js']:[tsx,'src/index.ts'];
  const child=spawn(process.execPath,entry,{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let output='';
  for(const stream of [child.stdout,child.stderr]) stream.on('data',chunk=>{output=(output+chunk.toString()).slice(-30000);});
  child.on('error',error=>{output+='\n'+String(error);});
  for(let i=0;i<400;i++) {
    if(child.exitCode!==null||child.signalCode) throw Error('API exited before readiness: '+output.slice(-6000));
    try {
      const response=await fetch('http://127.0.0.1:'+port+'/health',{signal:AbortSignal.timeout(600)});
      if(response.ok) return child;
    } catch {}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  child.kill();
  throw Error('API startup timed out: '+output.slice(-6000));
}
async function stopApi(child) {
  if(child.exitCode!==null || child.signalCode!==null) return;
  child.kill('SIGTERM');
  await Promise.race([once(child,'exit'),new Promise(resolve=>setTimeout(resolve,5000))]);
  if(child.exitCode===null && child.signalCode===null) {
    child.kill('SIGKILL');
    await once(child,'exit');
  }
}
async function request(port,path,method='GET',token=null,payload=undefined,extraHeaders={}) {
  const response=await fetch('http://127.0.0.1:'+port+'/api'+path,{
    method,
    headers:{...(token?{authorization:'Bearer '+token}:{}),...(payload!==undefined?{'content-type':'application/json'}:{}),...extraHeaders},
    ...(payload!==undefined?{body:JSON.stringify(payload)}:{})
  });
  const body=await response.text();
  return {status:response.status,data:body?JSON.parse(body):{},
    cookie:response.headers.get('set-cookie'),serverTiming:response.headers.get('server-timing')};
}
const connected=async(client,fn)=>{await client.connect();try{return await fn(client);}finally{await client.end();}};
for(const mode of ['normalized','typed']) test(mode+' SQL API preserves metadata, linked records, Flows, users and sessions across restart',{skip:!base,timeout:240000},async()=>{
  const url=new URL(base);
  assert.ok(['localhost','127.0.0.1','::1'].includes(url.hostname),'No external database access');
  assert.equal(url.pathname,'/postgres','Require disposable local administrator DB');
  const {default:pg}=await import('pg');
  const suffix=randomBytes(6).toString('hex');
  const sourceName='mrel_api_source_'+suffix,targetName='mrel_api_target_'+suffix;
  const databaseUrl=name=>{const u=new URL(base);u.pathname='/'+name;return u.toString();};
  const admin=new pg.Client({connectionString:base,ssl:false});
  const dir=mkdtempSync(join(tmpdir(),'metadrive-rel-api-'));
  const tenantId='migration-api-'+suffix, email='admin@migration-api.test',password='Safe-Staging-Password-2026!';
  let child=null;
  await admin.connect();
  try {
    await admin.query('CREATE DATABASE '+sourceName);
    await admin.query('CREATE DATABASE '+targetName);
    const port=await freePort();
    const legacyPath=join(dir,'legacy-state.json');
    child=await startApi(port,legacyPath,{
      DATABASE_URL:'',
      METADRIVE_TEST_MODE:'true',
      METADRIVE_BOOTSTRAP_TENANT_ID:tenantId,
      METADRIVE_BOOTSTRAP_TENANT_NAME:'Relational API Smoke',
      METADRIVE_BOOTSTRAP_ADMIN_EMAIL:email,
      METADRIVE_BOOTSTRAP_ADMIN_PASSWORD:password
    });
    const legacyLogin=await request(port,'/auth/login','POST',null,{email,password});
    assert.equal(legacyLogin.status,200,JSON.stringify(legacyLogin.data));
    await stopApi(child);child=null;
    const initial=JSON.parse(readFileSync(legacyPath,'utf8'));
    assert.ok(initial.users.some(u=>u.email===email));
    assert.ok(initial.tenants[tenantId]);
    // Create the isolated cutover copy from the exact same legacy snapshot.
    await connected(new pg.Client({connectionString:databaseUrl(targetName),ssl:false}),async(client)=>{
      await client.query('CREATE TABLE metadrive_platform_state(id INTEGER PRIMARY KEY,payload JSONB NOT NULL)');
      await client.query('INSERT INTO metadrive_platform_state(id,payload) VALUES (1,$1::jsonb)',[JSON.stringify(initial)]);
      const sql=readFileSync(resolve(root,'sql/normalized-state-v3.sql'),'utf8');
      await client.query(sql);
      await client.query('BEGIN');
      try {
        await initializeNormalizedState(client,initial);
        if(mode==='typed') {
          await client.query('CREATE TABLE metadrive_rel_tenants(tenant_id TEXT PRIMARY KEY)');
          await client.query(readFileSync(resolve(root,'sql/normalized-registry-v2.sql'),'utf8'));
          await synchronizeTypedRecords(client,initial);
        }
        await client.query('COMMIT');
      }
      catch(error) {await client.query('ROLLBACK');throw error;}
    });
    const relationalPath=join(dir,'relational-state.json');
    const relationalEnv={
      DATABASE_URL:databaseUrl(targetName), METADRIVE_TEST_MODE:'false',
      METADRIVE_PERSISTENCE_MODE:mode,METADRIVE_NORMALIZED_ALLOW_RUNTIME:'true'
    };
    child=await startApi(port,relationalPath,relationalEnv);
    const login=await request(port,'/auth/login?landing=1','POST',null,{email,password});
    assert.equal(login.status,200,JSON.stringify(login.data));
    assert.ok(login.data.landing?.objects?.some(o=>o.apiName==='Account'),
      'Authenticated landing must include only permitted tenant object metadata');
    assert.ok(login.data.landing?.user?.profileId,'Landing requires current RBAC profile');
    assert.ok(login.cookie,'Login must issue an HttpOnly refresh session');
    const sessionCookie=login.cookie.split(';')[0];
    const refreshed=await request(port,'/auth/refresh?landing=1','POST',null,undefined,{cookie:sessionCookie});
    assert.equal(refreshed.status,200,JSON.stringify(refreshed.data));
    assert.ok(refreshed.data.landing?.objects?.some(o=>o.apiName==='Account'));
    assert.ok(refreshed.data.landing?.user?.fieldAccess,'Refresh bootstrap must contain authoritative field permissions');
    assert.ok(refreshed.cookie && refreshed.cookie!==login.cookie,
      'Restored session must retain refresh-token rotation');
    assert.match(refreshed.serverTiming??'',/commit-wait;dur=/,
      'SQL-only restore must measure durable commit wait');
    const token=refreshed.data.access_token;
    const account=await request(port,'/records/Account','POST',token,{Name:'Relational Parent'});
    assert.equal(account.status,201,JSON.stringify(account.data));
    const parentId=account.data.record.Id;
    const object=await request(port,'/metadata/objects','POST',token,{
      apiName:'Migration_Link__c',label:'Migration Link',pluralLabel:'Migration Links',
      kind:'Custom Object',description:'Metadata-driven relational persistence smoke',
      listViewButtons:['New','Import'],
      fields:[
        {apiName:'Name',label:'Name',dataType:'Text(80)',required:true,unique:true},
        {apiName:'Account__c',label:'Related Account',dataType:'Lookup(Account)',required:false,unique:false,
         relationship:{type:'Lookup',targetObject:'Account',relationshipName:'Account',childRelationshipName:'MigrationLinks'}}
      ]
    });
    assert.equal(object.status,201,JSON.stringify(object.data));
    const linked=await request(port,'/records/Migration_Link__c','POST',token,{Name:'Relational Child',Account__c:parentId});
    assert.equal(linked.status,201,JSON.stringify(linked.data));
    const recordId=linked.data.record.Id;
    const edited=await request(port,'/records/Migration_Link__c/'+recordId,'PUT',token,{Name:'Relational Child Updated'});
    assert.equal(edited.status,200,JSON.stringify(edited.data));
    const staleEdit=await request(port,'/records/Migration_Link__c/'+recordId,'PUT',token,
      {Name:'Should Not Persist'}, { 'If-Unmodified-Since': linked.data.record.LastModifiedDate });
    assert.equal(staleEdit.status,412,'stale record revision must reject unsafe update');
    const currentEdit=await request(port,'/records/Migration_Link__c/'+recordId,'GET',token);
    assert.equal(currentEdit.data.record.Name,'Relational Child Updated');
    const imported=await request(port,'/records/Migration_Link__c/import','POST',token,{
      records:Array.from({length:51},(_,index)=>({Name:'Imported '+index,Account__c:parentId}))
    });
    assert.equal(imported.status,201,JSON.stringify(imported.data));
    assert.equal(imported.data.count,51);
    const removed=await request(port,'/records/Migration_Link__c/'+imported.data.records[0].Id,'DELETE',token);
    assert.equal(removed.status,204,JSON.stringify(removed.data));
    const firstPage=await request(port,'/records/Migration_Link__c?limit=50&offset=0','GET',token);
    const finalPage=await request(port,'/records/Migration_Link__c?limit=50&offset=50','GET',token);
    assert.equal(firstPage.status,200,JSON.stringify(firstPage.data));
    assert.equal(finalPage.status,200,JSON.stringify(finalPage.data));
    assert.equal(firstPage.data.total,51,'Server must count filtered records before pagination');
    assert.equal(firstPage.data.records.length,50);
    assert.equal(finalPage.data.records.length,1);
    const rejectedImport=await request(port,'/records/Migration_Link__c/import','POST',token,{
      records:[{Name:'Atomic Unique Staged',Account__c:parentId},{Name:'Imported 1',Account__c:parentId}]
    });
    assert.equal(rejectedImport.status,422,'duplicate import must be rejected atomically');
    const afterFailedImport=await request(port,'/records/Migration_Link__c?limit=50&offset=0','GET',token);
    assert.equal(afterFailedImport.data.total,51,'rejected CSV may not partially persist valid earlier rows');
    const sortedFirst=await request(port,'/records/Migration_Link__c?sortField=Name&sortDirection=asc&limit=50&offset=0','GET',token);
    const sortedLast=await request(port,'/records/Migration_Link__c?sortField=Name&sortDirection=asc&limit=50&offset=50','GET',token);
    assert.equal(sortedFirst.status,200,JSON.stringify(sortedFirst.data));
    assert.equal(sortedLast.status,200,JSON.stringify(sortedLast.data));
    assert.equal(sortedFirst.data.records.length,50);
    assert.equal(sortedLast.data.records.length,1);
    const sortedNames=[...sortedFirst.data.records,...sortedLast.data.records].map(r=>String(r.Name));
    const collator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
    assert.deepEqual(sortedNames,[...sortedNames].sort(collator.compare),'sort must precede pagination');
    const invalidSort=await request(port,'/records/Migration_Link__c?sortField=Unregistered_Field&sortDirection=asc&limit=50','GET',token);
    assert.equal(invalidSort.status,400,'arbitrary sort field must be rejected');
    const invalidDirection=await request(port,'/records/Migration_Link__c?sortField=Name&sortDirection=sideways&limit=50','GET',token);
    assert.equal(invalidDirection.status,400,'invalid sort directions must be rejected');
    const immediatePool=new pg.Pool({connectionString:databaseUrl(targetName),ssl:false,max:2});
    try {
      const committed=await readNormalizedState(immediatePool,mode==='typed'?verifyTypedRecords:null);
      const values=committed.state.tenants[tenantId].records.Migration_Link__c;
      assert.equal(values.length,51,'Successful CRUD/import responses must already be durable in SQL');
      assert.equal(values.find(item=>item.Id===recordId)?.Name,'Relational Child Updated');
      assert.ok(!values.some(item=>item.Id===imported.data.records[0].Id));
    } finally {await immediatePool.end();}
    const flow=await request(port,'/metadata/flows/Relational_Smoke','PUT',token,{
      label:'Relational Smoke',flowType:'Autolaunched Flow',status:'Active',
      versionNumber:1,activeVersion:null,triggerObject:null,startConfig:{},
      elements:[{id:1,type:'Start',label:'Start',config:{}}],
      connectors:[],resources:[],versions:[]
    });
    assert.equal(flow.status,200,JSON.stringify(flow.data));
    const execution=await request(port,'/flows/Relational_Smoke/execute','POST',token,{});
    assert.equal(execution.status,200,JSON.stringify(execution.data));
    await stopApi(child);child=null;
    if(mode==='typed') assert.equal(existsSync(relationalPath),false,'SQL-only runtime must not write a local JSON snapshot');
    // Restart with another local state file; the relational DB must remain the authority.
    child=await startApi(port,join(dir,'after-restart.json'),relationalEnv);
    const restarted=await request(port,'/auth/login','POST',null,{email,password});
    assert.equal(restarted.status,200,JSON.stringify(restarted.data));
    const freshToken=restarted.data.access_token;
    const objectAfter=await request(port,'/metadata/objects/Migration_Link__c','GET',freshToken);
    assert.equal(objectAfter.status,200,JSON.stringify(objectAfter.data));
    assert.ok(objectAfter.data.object.fields.some(f=>f.apiName==='Account__c'));
    const childAfter=await request(port,'/records/Migration_Link__c/'+recordId,'GET',freshToken);
    assert.equal(childAfter.status,200,JSON.stringify(childAfter.data));
    assert.equal(childAfter.data.record.Account__c,parentId);
    assert.equal(childAfter.data.record.Name,'Relational Child Updated');
    const flowAfter=await request(port,'/metadata/flows','GET',freshToken);
    assert.equal(flowAfter.status,200,JSON.stringify(flowAfter.data));
    assert.ok(flowAfter.data.flows.some(f=>f.apiName==='Relational_Smoke'));
    const sqlPool=new pg.Pool({connectionString:databaseUrl(targetName),ssl:false});
    try {
      const verified=await readNormalizedState(sqlPool,mode==='typed'?verifyTypedRecords:null);
      assert.ok(verified.version>0);
      assert.equal(verified.state.tenants[tenantId].records.Migration_Link__c[0].Account__c,parentId);
      assert.ok(verified.state.tenants[tenantId].flows.some(f=>f.apiName==='Relational_Smoke'));
      const sqlOnly=await sqlPool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='md_v3_state_nodes' AND data_type IN ('json','jsonb')");
      assert.equal(sqlOnly.rowCount,0);
      if(mode==='typed') {
        const physical=await sqlPool.query('SELECT COUNT(*)::int AS n FROM md_v2_object_registry WHERE active=true');
        assert.equal(physical.rows[0].n,verified.state.tenants[tenantId].objects.length);
      }
      const baseline=await sqlPool.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
      assert.deepEqual(baseline.rows[0].payload,initial,'Legacy rollback snapshot stays untouched');
    } finally {await sqlPool.end();}
    // A logout response must be durably revoked even if the API process dies
    // before any further full metadata snapshot. Replaying a token or refresh
    // cookie across restart must never reauthorize this user.
    const logoutCookie = restarted.cookie?.split(';')[0];
    assert.ok(logoutCookie,'Successful authentication returns a refresh cookie');
    const logout = await request(port,'/auth/logout','POST',freshToken,undefined,{cookie:logoutCookie});
    assert.equal(logout.status,204,JSON.stringify(logout.data));
    assert.equal((await request(port,'/auth/me','GET',freshToken)).status,401,
      'Signed-out access JWT must fail immediately');
    if(mode==='typed') {
      assert.match(logout.serverTiming??'',/commit-wait;dur=/,
        'Durable SQL sign-out must expose its commit timing');
      const logoutPool=new pg.Pool({connectionString:databaseUrl(targetName),ssl:false});
      try {
        const rows=await logoutPool.query('SELECT COUNT(*)::int AS n FROM md_auth_logout_revocations');
        assert.ok(rows.rows[0].n>0,'Atomic logout tombstone must be in PostgreSQL before HTTP 204');
        const jsonCols=await logoutPool.query(
          "SELECT count(*)::int AS n FROM information_schema.columns WHERE table_name='md_auth_logout_revocations' AND data_type IN ('json','jsonb')");
        assert.equal(jsonCols.rows[0].n,0,'Logout storage must have no JSON/JSONB columns');
      } finally {await logoutPool.end();}
    }
    await stopApi(child);child=null;
    child=await startApi(port,join(dir,'after-logout-restart.json'),relationalEnv);
    assert.equal((await request(port,'/auth/me','GET',freshToken)).status,401,
      'Restart must not resurrect a signed-out access JWT');
    assert.equal((await request(port,'/auth/refresh','POST',null,undefined,{cookie:logoutCookie})).status,401,
      'Restart must not resurrect a revoked refresh cookie');
  } finally {
    if(child) await stopApi(child);
    for(const db of [sourceName,targetName]) await admin.query('DROP DATABASE IF EXISTS '+db+'');
    await admin.end();
    rmSync(dir,{recursive:true,force:true});
  }
});
