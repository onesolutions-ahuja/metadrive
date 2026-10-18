import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {scryptSync,randomBytes} from 'node:crypto';
import {registerAuthSqlRoutes} from '../../src/system-files/auth-sql-routes.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
test('SQL password change verifies old password and revokes both session types atomically',async()=>{
 const salt=randomBytes(16).toString('hex'),oldPassword='correct-old-password';
 const oldHash='scrypt:'+salt+':'+scryptSync(oldPassword,salt,64).toString('hex');
 const calls:string[]=[];
 const client={query:async(sql:string,args?:unknown[])=>{
  calls.push(sql);
  if(sql.includes('SELECT password_hash'))return {rows:[{password_hash:oldHash}]};
  return {rows:[],rowCount:1};
 }};
 const db={transaction:async(fn:(c:typeof client)=>Promise<unknown>)=>fn(client)} as unknown as SqlPersistence;
 const app=express();app.use(express.json());app.use((req,_res,next)=>{
  (req as typeof req&{actor:unknown}).actor={tenant_id:'tenant',user_id:'user'};next();
 });
 registerAuthSqlRoutes(app,db,{} as RbacEngine);
 const server=app.listen(0,'127.0.0.1');
 try{
  const url='http://127.0.0.1:'+(server.address() as import('node:net').AddressInfo).port;
  const resp=await fetch(url+'/api/auth/change-password',{
   method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({currentPassword:oldPassword,newPassword:'new-secure-password-56789'})
  });
  assert.equal(resp.status,204);
  assert.equal(calls.filter(q=>q.startsWith('UPDATE md_users')).length,1);
  assert.equal(calls.filter(q=>q.startsWith('UPDATE md_sessions')).length,1);
  assert.equal(calls.filter(q=>q.startsWith('UPDATE md_refresh_sessions')).length,1);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
