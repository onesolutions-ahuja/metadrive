import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerApprovalSqlRoutes} from '../../src/system-files/approval-sql-routes.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
test('SQL approvals enforce tenant and reviewer on inbox and decisions',async()=>{
 const inputs:unknown[][]=[];const permissions:string[]=[];
 const db={query:async(_sql:string,args:unknown[])=>{inputs.push(args);return {rows:[]};}} as unknown as SqlPersistence;
 const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{permissions.push(resource+':'+action);}} as unknown as RbacEngine;
 const app=express();app.use(express.json());
 app.use((req,_res,next)=>{(req as typeof req&{actor:unknown}).actor={tenant_id:'tenant',user_id:'reviewer'};next();});
 registerApprovalSqlRoutes(app,db,rbac);
 const server=app.listen(0,'127.0.0.1');
 try{
  const url='http://127.0.0.1:'+(server.address() as import('node:net').AddressInfo).port;
  const inbox=await fetch(url+'/api/approvals/inbox');assert.equal(inbox.status,200);
  assert.deepEqual(inputs[0],['tenant','reviewer']);
  const id='d09ecb47-daf8-40bd-8dcc-73db87c21a4d';
  const decision=await fetch(url+'/api/approvals/'+id+'/decision',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision:'Approved'})});
  assert.equal(decision.status,500); // no pending request, handler fails closed
  assert.deepEqual(inputs[1].slice(0,4),['tenant','reviewer',id,'Approved']);
  assert.ok(permissions.includes('ApprovalRequest:read'));
  assert.ok(permissions.includes('ApprovalRequest:edit'));
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
