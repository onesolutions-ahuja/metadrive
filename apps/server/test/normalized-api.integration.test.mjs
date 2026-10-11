// End-to-end MetaDrive API smoke: legacy bootstrap -> verified relational copy
// -> login, dynamic metadata, related records and Flow -> restart -> persistence.
// Strictly local, disposable databases; never accesses live provider databases.
import test from 'node:test';
import {initializeNormalizedState,readNormalizedState} from '../src/normalized-state-runtime.mjs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn,spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { mkdtempSync,readFileSync,rmSync } from 'node:fs';
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
  const entry=['relational','normalized'].includes(options.METADRIVE_PERSISTENCE_MODE)?['dist/index.js']:[tsx,'src/index.ts'];
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
async function request(port,path,method='GET',token=null,payload=undefined) {
  const response=await fetch('http://127.0.0.1:'+port+'/api'+path,{
    method,
    headers:{...(token?{authorization:'Bearer '+token}:{}),...(payload!==undefined?{'content-type':'application/json'}:{})},
    ...(payload!==undefined?{body:JSON.stringify(payload)}:{})
  });
  const body=await response.text();
  return {status:response.status,data:body?JSON.parse(body):{}};
}
const connected=async(client,fn)=>{await client.connect();try{return await fn(client);}finally{await client.end();}};
test('normalized SQL-only API preserves metadata, linked records, Flows, users and sessions across restart',{skip:!base,timeout:180000},async()=>{
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
      try {await initializeNormalizedState(client,initial); await client.query('COMMIT');}
      catch(error) {await client.query('ROLLBACK');throw error;}
    });
    const relationalPath=join(dir,'relational-state.json');
    const relationalEnv={
      DATABASE_URL:databaseUrl(targetName), METADRIVE_TEST_MODE:'false',
      METADRIVE_PERSISTENCE_MODE:'normalized',METADRIVE_NORMALIZED_ALLOW_RUNTIME:'true'
    };
    child=await startApi(port,relationalPath,relationalEnv);
    const login=await request(port,'/auth/login','POST',null,{email,password});
    assert.equal(login.status,200,JSON.stringify(login.data));
    const token=login.data.access_token;
    const account=await request(port,'/records/Account','POST',token,{Name:'Relational Parent'});
    assert.equal(account.status,201,JSON.stringify(account.data));
    const parentId=account.data.record.Id;
    const object=await request(port,'/metadata/objects','POST',token,{
      apiName:'Migration_Link__c',label:'Migration Link',pluralLabel:'Migration Links',
      kind:'Custom Object',description:'Metadata-driven relational persistence smoke',
      fields:[
        {apiName:'Name',label:'Name',dataType:'Text(80)',required:true,unique:false},
        {apiName:'Account__c',label:'Related Account',dataType:'Lookup(Account)',required:false,unique:false,
         relationship:{type:'Lookup',targetObject:'Account',relationshipName:'Account',childRelationshipName:'MigrationLinks'}}
      ]
    });
    assert.equal(object.status,201,JSON.stringify(object.data));
    const linked=await request(port,'/records/Migration_Link__c','POST',token,{Name:'Relational Child',Account__c:parentId});
    assert.equal(linked.status,201,JSON.stringify(linked.data));
    const recordId=linked.data.record.Id;
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
    const flowAfter=await request(port,'/metadata/flows','GET',freshToken);
    assert.equal(flowAfter.status,200,JSON.stringify(flowAfter.data));
    assert.ok(flowAfter.data.flows.some(f=>f.apiName==='Relational_Smoke'));
    const sqlPool=new pg.Pool({connectionString:databaseUrl(targetName),ssl:false});
    try {
      const verified=await readNormalizedState(sqlPool);
      assert.ok(verified.version>0);
      assert.equal(verified.state.tenants[tenantId].records.Migration_Link__c[0].Account__c,parentId);
      assert.ok(verified.state.tenants[tenantId].flows.some(f=>f.apiName==='Relational_Smoke'));
      const sqlOnly=await sqlPool.query(
        "SELECT column_name FROM information_schema.columns WHERE table_name='md_v3_state_nodes' AND data_type IN ('json','jsonb')");
      assert.equal(sqlOnly.rowCount,0);
      const baseline=await sqlPool.query('SELECT payload FROM metadrive_platform_state WHERE id=1');
      assert.deepEqual(baseline.rows[0].payload,initial,'Legacy rollback snapshot stays untouched');
    } finally {await sqlPool.end();}
  } finally {
    if(child) await stopApi(child);
    for(const db of [sourceName,targetName]) await admin.query('DROP DATABASE IF EXISTS '+db+'');
    await admin.end();
    rmSync(dir,{recursive:true,force:true});
  }
});
