import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {registerDurableJobAdminRoutes} from '../../src/system-support/durable-job-admin-routes.js';

test('job administration enforces central RBAC and scopes SQL to the requesting tenant',async()=>{
 const tenantA='00000000-0000-4000-8000-000000000001';
 const tenantB='00000000-0000-4000-8000-000000000002';
 const user='00000000-0000-4000-8000-000000000003';
 const seen:Array<{sql:string;params:unknown[]}>=[];

 const db={query:async(sql:string,params:unknown[])=>{
  seen.push({sql,params});
  return {rows:[],rowCount:0};
 }} as unknown as SqlPersistence;
 const rbac={require:async(tenant:string,_actor:string,resource:string,action:string)=>{
  assert.equal(resource,'Tenant');
  assert.equal(action,'manage');
  if(tenant!==tenantA)throw new Error('Permission denied');
 }} as unknown as RbacEngine;
 const app=express();
 app.use((req,_res,next)=>{
  (req as typeof req & {actor:unknown}).actor={
   tenant_id:req.get('x-test-tenant'),user_id:user
  };
  next();
 });
 registerDurableJobAdminRoutes(app,db,rbac);
 app.use((_err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{
  res.status(403).json({error:'Permission denied'});
 });
 const server=app.listen(0);
 try{
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('Test listener unavailable');
  const base='http://127.0.0.1:'+address.port;
  const allowed=await fetch(base+'/api/job-admin/jobs?status=failed',{headers:{'x-test-tenant':tenantA}});
  assert.equal(allowed.status,200);
  assert.equal(seen.length,1);
  assert.match(seen[0].sql,/WHERE tenant_id=\$1 AND status=\$2/);
  assert.deepEqual(seen[0].params,[tenantA,'failed']);
  const denied=await fetch(base+'/api/job-admin/jobs?status=failed',{headers:{'x-test-tenant':tenantB}});
  assert.equal(denied.status,403);
  assert.equal(seen.length,1);
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()));
 }
});
