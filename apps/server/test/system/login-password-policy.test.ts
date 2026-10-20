import assert from 'node:assert/strict';
import {test} from 'node:test';
import {AuthenticationService} from '../../src/system-files/authentication.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {PasswordPolicyService,passwordPolicySchema,validatePassword,checkPasswordHistory} from '../../src/system-support/password-policy-service.js';

test('tenant password policies validate bounds, complexity and maximum password size',()=>{
 const policy=passwordPolicySchema.parse({min_length:16,require_uppercase:true,require_lowercase:true,require_number:true,require_symbol:true});
 assert.doesNotThrow(()=>validatePassword('Secure long phrase 1!',policy));
 for(const password of ['short','long password phrase 1!','LONG PASSWORD PHRASE 1!','Long Password Phrase!!','Long Password Phrase 12','A'.repeat(1025)])
  assert.throws(()=>validatePassword(password,policy),/Invalid password/);
 for(const input of [{min_length:1},{history_count:25},{max_failed_attempts:0},{lockout_minutes:0},{max_age_days:-1},{unknown:true}])
  assert.equal(passwordPolicySchema.safeParse(input).success,false);
});

test('policy read and mutation use central RBAC before touching SQL',async()=>{
 const service=new PasswordPolicyService({query:async()=>{throw Error('SQL must not run');}} as unknown as SqlPersistence,
  {require:async()=>{throw Error('Permission denied');}} as unknown as RbacEngine);
 await assert.rejects(()=>service.read('tenant','user'),/Permission denied/);
 await assert.rejects(()=>service.save('tenant','user',{}),/Permission denied/);
});

test('password history queries are tenant scoped and reject reuse',async()=>{
 const db={query:async(sql:string,args:unknown[])=>{
  assert.equal(args[0],'tenant');
  if(sql.includes('md_password_policies'))return {rows:[{history_count:3}]};
  assert.deepEqual(args,['tenant','user',3]);return {rows:[{password_hash:'historical-password'}]};
 }} as unknown as SqlPersistence;
 await assert.rejects(()=>checkPasswordHistory(db,'tenant','user','historical-password','current-password',async(p,h)=>p===h),/recently used/);
 await assert.rejects(()=>checkPasswordHistory(db,'tenant','user','current-password','current-password',async(p,h)=>p===h),/recently used/);
});

test('failed-login counter commits before rejection, locks at threshold and resets after lock expiry',async()=>{
 let attempts=0,locked:Date|null=null,commits=0,revocations=0;
 const actions:string[]=[];
 const auth=new AuthenticationService({} as SqlPersistence);
 const hash=await auth.hashPassword('CorrectPassword!2026');
 const db={transaction:async(run:(client:unknown)=>Promise<unknown>)=>{
  const result=await run({query:async(sql:string,args:unknown[])=>{
   if(sql.includes('FROM md_password_policies'))return {rows:[{max_failed_attempts:3}]};
   if(sql.includes('SELECT id,password_hash'))return {rows:[{id:'user',password_hash:hash,enabled:true,locked_until:locked,failed_login_attempts:attempts,expired:false}]};
   assert.equal(args[0],'tenant');
   if(sql.includes('SET failed_login_attempts=$3')){attempts=Number(args[2]);locked=attempts>=3?new Date(Date.now()+900000):null;}
   if(sql.includes('SET failed_login_attempts=0')){attempts=0;locked=null;}
   if(sql.includes('revoked_at=now()'))revocations++;
   if(sql.includes('INSERT INTO md_security_events'))actions.push(sql.includes("'LoginFailed'")?'LoginFailed':String(args[2]));
   return {rows:[],rowCount:1};
  }});commits++;return result;
 }} as unknown as SqlPersistence;
 const service=new AuthenticationService(db);
 for(let n=0;n<3;n++)await assert.rejects(()=>service.verifyIdentity('tenant','user@example.test','wrong'),/Invalid credentials/);
 assert.equal(commits,3);assert.equal(attempts,3);assert.ok(locked);assert.equal(revocations,2);
 await assert.rejects(()=>service.verifyIdentity('tenant','user@example.test','CorrectPassword!2026'),/Invalid credentials/);
 assert.equal(attempts,3);
 locked=new Date(Date.now()-1000);
 await assert.rejects(()=>service.verifyIdentity('tenant','user@example.test','wrong'),/Invalid credentials/);
 assert.equal(attempts,1);
 assert.equal(await service.verifyIdentity('tenant','user@example.test','CorrectPassword!2026'),'user');
 assert.equal(attempts,0);assert.equal(locked,null);assert.equal(actions.filter(a=>a==='LoginFailed').length,5);
});

test('unknown users are audited with null actor and never update another tenant',async()=>{
 let logged=false;
 const db={transaction:async(run:(client:unknown)=>Promise<unknown>)=>run({query:async(sql:string,args:unknown[])=>{
  assert.equal(args[0],'tenant');
  if(sql.includes('INSERT INTO md_security_events')){assert.equal(args[1],null);assert.equal(args[2],'unknown@example.test');logged=true;}
  assert.ok(!sql.startsWith('UPDATE'));return {rows:[]};
 }})} as unknown as SqlPersistence;
 await assert.rejects(()=>new AuthenticationService(db).verifyIdentity('tenant','unknown@example.test','wrong'),/Invalid credentials/);
 assert.equal(logged,true);
});

test('expired passwords cannot finish password verification or create sessions',async()=>{
 const seed=new AuthenticationService({} as SqlPersistence),hash=await seed.hashPassword('CorrectPassword!2026');
 const db={transaction:async(run:(client:unknown)=>Promise<unknown>)=>run({query:async(sql:string)=>{
  assert.ok(!sql.includes('INSERT INTO md_sessions'));
  if(sql.includes('SELECT id,password_hash'))return {rows:[{id:'user',password_hash:hash,enabled:true,expired:true}]};
  return {rows:[]};
 }}),
 query:async(sql:string)=>{
  if(sql.includes('md_session_policies'))return {rows:[]};
  if(sql.includes('md_login_boundary_allowed'))return {rows:[{allowed:true,trusted:false}]};
  return {rows:[]};
 }} as unknown as SqlPersistence;
 await assert.rejects(()=>new AuthenticationService(db).verifyIdentity('tenant','user@example.test','CorrectPassword!2026'),/Password expired/);
 await assert.rejects(()=>new AuthenticationService(db).issueMfaSession('tenant','user'),/Invalid credentials/);
});
