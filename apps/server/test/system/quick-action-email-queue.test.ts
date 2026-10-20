import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NamedCredentialService} from '../../src/system-support/named-credential-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const tenant='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000002';
const credential='00000000-0000-4000-8000-000000000003';
const requestKey='00000000-0000-4000-8000-000000000004';
const jobId='00000000-0000-4000-8000-000000000005';
const toMail=(service:NamedCredentialService)=>service as unknown as {
 encryptValue:(s:string)=>Buffer;
 activeKeyId:()=>string;
 decryptValueWithKey:(x:Buffer,k:string)=>string;
 sendTenantEmail:(...args:unknown[])=>Promise<void>;
};

test('Quick Action SMTP persists encrypted job and deduplicates repeated request keys',async()=>{
 const inserts:unknown[][]=[];
 const audit:string[]=[];
 const hashes=new Map<string,string>();
 const client={query:async(sql:string,args:unknown[]=[])=>{
  if(sql.includes('FROM md_named_credentials'))return {rows:[{id:credential}],rowCount:1};
  if(sql.includes('INSERT INTO md_quick_action_email_jobs')){
   inserts.push(args);
   const key=String(args[8]),digest=String(args[9]);
   if(!hashes.has(key))hashes.set(key,digest);
   return {rows:[{id:jobId,payload_digest:hashes.get(key),status:'queued'}],rowCount:1};
  }
  if(sql.includes('INSERT INTO md_security_events'))audit.push(sql);
  return {rows:[],rowCount:1};
 }};
 const db={transaction:async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client)} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const svc=new NamedCredentialService(db,rbac);
 const internals=toMail(svc);
 internals.encryptValue=()=>Buffer.from('encrypted');
 internals.activeKeyId=()=> 'key-1';
 const args=[tenant,user,'Global','','Notify',credential,
  'sender@example.com','recipient@example.com','Subject','Body',requestKey] as const;
 const first=await svc.sendQuickActionEmail(...args);
 const second=await svc.sendQuickActionEmail(...args);
 assert.deepEqual(first,{status:'queued',jobId});
 assert.deepEqual(second,first);
 assert.equal(inserts.length,2);
 assert.ok(inserts.every(a=>a[6] instanceof Buffer && a[8]===requestKey));
 assert.equal(audit.length,2);
 await assert.rejects(()=>svc.sendQuickActionEmail(tenant,user,'Global','','Notify',
  credential,'sender@example.com','recipient@example.com','Changed','Body',requestKey),
  /request key already belongs/);
});

test('Quick Action SMTP dispatch fails closed if permissions changed, before SMTP',async()=>{
 let sent=0;
 const executed:string[]=[];
 const payload=Buffer.from('encrypted');
 const client={query:async(sql:string)=>{
  executed.push(sql);
  if(sql.includes('UPDATE md_quick_action_email_jobs j SET status'))
   return {rows:[{id:jobId,tenant_id:tenant,user_id:user,object_api:'Global',
    record_id:null,action_id:'Notify',credential_id:credential,
    payload_ciphertext:payload,encryption_key_id:'key-1'}],rowCount:1};
  return {rows:[],rowCount:1};
 }};
 const db={
  transaction:async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client),
  query:async(sql:string)=>{
   executed.push(sql);
   if(sql.includes('SELECT 1 FROM md_users'))return {rows:[{id:user}],rowCount:1};
   return {rows:[],rowCount:1};
  }
 } as unknown as SqlPersistence;
 const rbac={allowed:async()=>false} as unknown as RbacEngine;
 const svc=new NamedCredentialService(db,rbac);
 toMail(svc).sendTenantEmail=async()=>{sent++;};
 await svc.dispatchOneQuickActionEmail();
 assert.equal(sent,0);
 assert.ok(executed.some(sql=>sql.includes("error_code=$3")));
});
