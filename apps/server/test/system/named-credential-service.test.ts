import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NamedCredentialService} from '../../src/system-support/named-credential-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

test('credential listing is tenant-scoped and secrets never returned',async()=>{
 const reads:unknown[][]=[];
 const db={query:async(_sql:string,args:unknown[])=>{
  reads.push(args);return {rows:[{id:'abc',name:'Partner',label:'Partner',protocol:'HTTPS',
    base_url:'https://api.example',auth_type:'Bearer',header_name:'',
    secret_ciphertext:Buffer.from('sensitive'),enabled:true,updated_at:new Date()}]};
 }} as unknown as SqlPersistence;
 const gates:string[]=[];
 const rbac={require:async(_t:string,_u:string,res:string,action:string)=>{gates.push(res+':'+action);},
  allowed:async()=>true} as unknown as RbacEngine;
 const service=new NamedCredentialService(db,rbac);
 const credentials=await service.list('tenant-a','user-a');
 assert.deepEqual(reads[0],['tenant-a']);
 assert.deepEqual(gates,['NamedCredential:read']);
 assert.equal(credentials[0].hasSecret,true);
 assert.equal(JSON.stringify(credentials).includes('sensitive'),false);
});

test('credential mutations require OneEngine manage and tenant isolation',async()=>{
 const calls:unknown[][]=[];
 const db={query:async(sql:string,args:unknown[])=>{calls.push(args);
  if(sql.includes('FROM md_identity_providers'))return {rowCount:0,rows:[]};
  return {rowCount:1,rows:[{id:'x'}]};
 }} as unknown as SqlPersistence;
 const checks:string[]=[];
 const rbac={require:async(_t:string,_u:string,_r:string,action:string)=>{checks.push(action);}} as unknown as RbacEngine;
 const service=new NamedCredentialService(db,rbac);
 const id='00000000-0000-4000-8000-000000000001';
 await service.setEnabled('tenant-a','user-a',id,false);
 await service.remove('tenant-a','user-a',id);
 assert.deepEqual(checks,['manage','read','manage']);
 assert.deepEqual(calls[0],['tenant-a',id,false]);
 assert.deepEqual(calls[1],['tenant-a']); // Connector field definitions scoped to tenant.
 assert.deepEqual(calls[2],['tenant-a']); // Credential listing scoped to tenant.
 assert.deepEqual(calls[3],['tenant-a',id]); // Federation link check is tenant-scoped.
 assert.deepEqual(calls[4],['tenant-a',id]);
});

test('SMTP credentials cannot be created and legacy delivery fails explicitly',async()=>{
 let writes=0;
 const db={query:async()=>{writes++;return {rows:[],rowCount:1};}} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const service=new NamedCredentialService(db,rbac);
 await assert.rejects(service.create('tenant-a','user-a',{
  name:'LegacyMail',label:'Legacy Mail',protocol:'SMTP',authType:'Basic',
  baseUrl:'smtp://mail.example:587',headerName:'',secret:'secret'
 }),/Invalid credential/);
 await assert.rejects(service.sendTenantEmail('tenant-a','credential','from@example.com',
  'to@example.com','Subject','Body'),/SMTP email delivery has been removed/);
 assert.equal(writes,0);
});

test('deferred HTTP delivery quarantines revoked Flow execute permission before sending',async()=>{
 const queries:string[]=[];
 const job={id:'job-a',tenant_id:'tenant-a',run_id:'run-a',user_id:'user-a',
  credential_id:'credential-a',method:'POST',path_ciphertext:Buffer.alloc(0),
  headers_ciphertext:Buffer.alloc(0),body_ciphertext:null,
  idempotency_key_ciphertext:null,max_attempts:1,timeout_ms:1000,attempt_count:1};
 const db={
  transaction:async(fn:(client:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>
   fn({query:async(sql:string)=>{queries.push(sql);
    return {rows:sql.includes('RETURNING j.id')?[job]:[],rowCount:1};}}),
  query:async(sql:string,args?:unknown[])=>{queries.push(sql);
   if(sql.includes('SELECT f.api_name')){assert.deepEqual(args,['tenant-a','run-a','user-a']);
    return {rows:[{api_name:'Checkout'}]};}
   return {rowCount:1,rows:[]};}
 } as unknown as SqlPersistence;
 const checks:string[]=[];
 const rbac={allowed:async(t:string,u:string,r:string,a:string)=>{
  checks.push([t,u,r,a].join(':'));return false;}} as unknown as RbacEngine;
 const credentials=new NamedCredentialService(db,rbac);
 assert.equal(await credentials.dispatchOne(),true);
 assert.deepEqual(checks,['tenant-a:user-a:Flow:Checkout:execute']);
 assert.ok(queries.some(sql=>sql.includes("last_error='RECONCILIATION_REQUIRED'")));
 assert.equal(queries.some(sql=>sql.includes('FROM md_http_callout_job_values')),false,
  'Revoked Flow permissions must be rejected before decryption or remote delivery');
});
