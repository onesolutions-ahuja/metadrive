import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerRecordInteractionRoutes} from '../../src/system-files/record-interaction-routes.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
test('record activities and Chatter require tenant-scoped existence and OneEngine RBAC',async()=>{
 const calls:Array<{sql:string;args:unknown[]}>=[],checks:string[]=[];
 const db={query:async(sql:string,args:unknown[])=>{
  calls.push({sql,args});
  if(sql.includes('FROM md_records'))return {rows:[{id:args[2]}],rowCount:1};
  if(sql.includes('FROM md_record_activities'))return {rows:[],rowCount:0};
  if(sql.includes('FROM md_chatter_posts'))return {rows:[],rowCount:0};
  return {rows:[],rowCount:0};
 }} as unknown as SqlPersistence;
 const rbac={require:async(_t:string,_u:string,name:string,action:string)=>{checks.push(name+':'+action);}} as unknown as RbacEngine;
 const app=express();
 app.use(express.json());
 app.use((req,_res,next)=>{(req as typeof req&{actor:unknown}).actor={tenant_id:'tenantA',user_id:'userA'};next();});
 registerRecordInteractionRoutes(app,db,rbac);
 const server=await new Promise<import('node:http').Server>(done=>{const listening=app.listen(0,'127.0.0.1',()=>done(listening));});
 try{
  const id='0db71951-a429-4b3f-b947-adde07a6474a';
  const url='http://127.0.0.1:'+(server.address() as import('node:net').AddressInfo).port;
  const result=await fetch(url+'/api/records/Invoice/'+id+'/activities');
  assert.equal(result.status,200);
  assert.deepEqual((await result.json() as {activities:unknown[]}).activities,[]);
  assert.ok(checks.includes('Invoice:read'));
  assert.ok(calls.every(c=>c.args[0]==='tenantA'));
 }finally{await new Promise<void>(done=>server.close(()=>done()));}
});
