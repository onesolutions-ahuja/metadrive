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

test('Legacy Quick Action SMTP fails closed before queuing',async()=>{
 let transaction=false;
 const db={transaction:async()=>{transaction=true;}} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const svc=new NamedCredentialService(db,rbac);
 const args=[tenant,user,'Global','','Notify',credential,
  'sender@example.com','recipient@example.com','Subject','Body',requestKey] as const;
 await assert.rejects(()=>svc.sendQuickActionEmail(...args),
  /SMTP email delivery has been removed/);
 assert.equal(transaction,false);
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
