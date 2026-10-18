import assert from 'node:assert/strict';
import {test} from 'node:test';
import {NamedCredentialService} from './named-credential-service.js';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';

test('credential listing is tenant-scoped and secrets never returned',async()=>{
 const reads:unknown[][]=[];
 const db={query:async(_sql:string,args:unknown[])=>{
  reads.push(args);return {rows:[{id:'abc',name:'SMTP',label:'SMTP',protocol:'SMTP',
    base_url:'smtp.example',auth_type:'Basic',header_name:'',
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
 const db={query:async(_sql:string,args:unknown[])=>{calls.push(args);return {rowCount:1,rows:[{id:'x'}]};}} as unknown as SqlPersistence;
 const checks:string[]=[];
 const rbac={require:async(_t:string,_u:string,_r:string,action:string)=>{checks.push(action);}} as unknown as RbacEngine;
 const service=new NamedCredentialService(db,rbac);
 const id='00000000-0000-4000-8000-000000000001';
 await service.setEnabled('tenant-a','user-a',id,false);
 await service.remove('tenant-a','user-a',id);
 assert.deepEqual(checks,['manage','read','manage']);
 assert.deepEqual(calls[0],['tenant-a',id,false]);
 assert.deepEqual(calls[1],['tenant-a',id]);
});
