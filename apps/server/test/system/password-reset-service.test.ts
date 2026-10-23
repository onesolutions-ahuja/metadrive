import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {AuthenticationService} from '../../src/system-files/authentication.js';
import {PasswordResetService} from '../../src/system-support/password-reset-service.js';

test('reset requests keep tokens out of API and SQL, and use the verified sender',async()=>{
 let token:string|undefined,tokenHash:string|undefined;
 const queries:string[]=[];
 const db={
  query:async(sql:string,args:unknown[])=>{
   queries.push(sql);
   if(sql.includes('FROM md_password_recovery_settings'))return {rows:[{smtp_credential_id:'cred',from_email:'no-reply@example.org',
    policy:{templates:{email:{subject:'Reset','body':'Code: {!Verification.Value}'}}}}]};
   if(sql.includes('FROM md_users'))return {rows:[{id:'known-user'}]};
   return {rows:[],rowCount:1};
  },
  transaction:async(run:(client:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>run({
   query:async(sql:string,args?:unknown[])=>{
    queries.push(sql);
    if(sql.includes('count(*)'))return {rows:[{requests:'0'}]};
    if(sql.includes('INSERT INTO md_password_reset_challenges'))tokenHash=String(args?.[2]);
    return {rows:[],rowCount:1};
   }
  })
 } as unknown as SqlPersistence;
 const service=new PasswordResetService(db,{hashPassword:async()=>''} as unknown as AuthenticationService,
  async(_tenant,_cred,_from,_to,_subject,body)=>{token=body.split('Code: ')[1];});
 const result=await service.request('tenant','person@example.org');
 assert.deepEqual(result,{message:'If this account exists, recovery instructions have been sent.'});
 assert.match(token??'',/^[a-zA-Z0-9_-]{43}$/);
 assert.match(tokenHash??'',/^[a-f0-9]{64}$/);
 assert.notEqual(tokenHash,token);
 assert.ok(!JSON.stringify(result).includes(token??''));
 assert.ok(queries.some(q=>q.includes('pg_advisory_xact_lock')));
});

test('reset confirmation revokes both session types and audits inside one transaction',async()=>{
 const queries:string[]=[];
 const db={transaction:async(run:(client:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>run({
  query:async(sql:string)=>{
   queries.push(sql);
   if(sql.includes('FROM md_password_reset_challenges'))return {rows:[{id:'challenge',user_id:'user',password_hash:'old-hash'}]};
   return {rows:[],rowCount:1};
  }
 })} as unknown as SqlPersistence;
 const auth={hashPassword:async()=> 'encoded-hash',verifyPassword:async()=>false} as unknown as AuthenticationService;
 const service=new PasswordResetService(db,auth,async()=>{});
 await service.confirm('tenant','person@example.org','A'.repeat(43),'new-long-password');
 assert.equal(queries.filter(sql=>sql.includes('revoked_at=now()')).length,2);
 assert.ok(queries.some(sql=>sql.includes('consumed_at=now()')));
 assert.ok(queries.some(sql=>sql.includes('INSERT INTO md_security_events')));
});

test('password recovery works without tenant SMTP settings',async()=>{
 let sentBody='';
 const db={
  query:async(sql:string)=>{
   if(sql.includes('FROM md_password_recovery_settings'))return {rows:[]};
   if(sql.includes('FROM md_users'))return {rows:[{id:'tenant-b-user'}]};
   return {rows:[],rowCount:1};
  },
  transaction:async(run:(client:{query:(sql:string,args?:unknown[])=>Promise<unknown>})=>Promise<unknown>)=>run({
   query:async(sql:string)=>sql.includes('count(*)')
    ?{rows:[{requests:'0'}]}:{rows:[],rowCount:1}
  })
 } as unknown as SqlPersistence;
 const service=new PasswordResetService(db,{hashPassword:async()=>''} as unknown as AuthenticationService,
  async(tenant,credential,from,to,subject,body)=>{
   assert.equal(tenant,'tenant-b');
   assert.equal(credential,'');
   assert.equal(from,'');
   assert.equal(to,'person@example.org');
   sentBody=body;
  });
 const result=await service.request('tenant-b','person@example.org');
 assert.deepEqual(result,{message:'If this account exists, recovery instructions have been sent.'});
 assert.match(sentBody,/[A-Za-z0-9_-]{43}/);
});

test('tenant recovery settings never select tenant credentials or sender identity',async()=>{
 const calls:Array<{tenant:string;credential:string;from:string;recipient:string}>=[];
 const db={
  query:async(sql:string)=>{
   if(sql.includes('FROM md_password_recovery_settings'))return {rows:[{
    smtp_credential_id:'tenant-secret-credential',from_email:'attacker-controlled@example.test',
    policy:{method:'OTP',templates:{email:{subject:'Account recovery',body:'Code {!Verification.Value}'}}}
   }]};
   if(sql.includes('FROM md_users'))return {rows:[{id:'user-a'}]};
   return {rows:[],rowCount:1};
  },
  transaction:async(run:(client:{query:(sql:string)=>Promise<unknown>})=>Promise<unknown>)=>run({
   query:async(sql:string)=>sql.includes('count(*)')?{rows:[{requests:'0'}]}:{rows:[],rowCount:1}
  })
 } as unknown as SqlPersistence;
 const service=new PasswordResetService(db,{} as AuthenticationService,
  async(tenant,credential,from,recipient)=>{
   calls.push({tenant,credential,from,recipient});
  });
 await service.request('tenant-a','same@example.test');
 assert.deepEqual(calls,[{tenant:'tenant-a',credential:'',from:'',recipient:'same@example.test'}]);
});

test('missing platform transport preserves account privacy and deletes issued token',async()=>{
 const deleted:Array<unknown[]|undefined>=[];
 const db={
  query:async(sql:string,args?:unknown[])=>{
   if(sql.includes('FROM md_password_recovery_settings'))return {rows:[]};
   if(sql.includes('FROM md_users'))return {rows:[{id:'existing-user'}]};
   if(sql.includes('DELETE FROM md_password_reset_challenges'))deleted.push(args);
   return {rows:[],rowCount:1};
  },
  transaction:async(run:(client:{query:(sql:string)=>Promise<unknown>})=>Promise<unknown>)=>run({
   query:async(sql:string)=>sql.includes('count(*)')?{rows:[{requests:'0'}]}:{rows:[],rowCount:1}
  })
 } as unknown as SqlPersistence;
 const service=new PasswordResetService(db,{} as AuthenticationService,
  async()=>{throw new Error('SMTP unavailable');});
 const oldError=console.error;
 console.error=()=>{};
 try{
  assert.deepEqual(await service.request('tenant-a','existing@example.test'),
   {message:'If this account exists, recovery instructions have been sent.'});
 }finally{console.error=oldError;}
 assert.equal(deleted.length,1);
 assert.equal(deleted[0]?.[0],'tenant-a');
 assert.match(String(deleted[0]?.[1]),/^[a-f0-9]{64}$/);
});
