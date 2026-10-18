import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerRouteAliasSqlRoutes} from '../../src/system-files/route-alias-sql-routes.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
test('SQL aliases are tenant filtered and guarded by OneEngine permissions',async()=>{
 const queries:Array<{sql:string;args:unknown[]}>=[],checks:string[]=[];
 const db={query:async(sql:string,args:unknown[])=>{queries.push({sql,args});return {rows:[{app_api:'Sales',slug:'sales',kind:'App Home',target_api:'Home',status:'Active',version:1}]};}} as unknown as SqlPersistence;
 const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{checks.push(resource+':'+action);}} as unknown as RbacEngine;
 const app=express();
 app.use((req,_res,next)=>{(req as typeof req&{actor:unknown}).actor={tenant_id:'tenant-a',user_id:'member-a'};next();});
 registerRouteAliasSqlRoutes(app,db,rbac);
 const server=app.listen(0,'127.0.0.1');
 try{
  const port=(server.address() as import('node:net').AddressInfo).port;
  const response=await fetch('http://127.0.0.1:'+port+'/api/metadata/route-aliases');
  assert.equal(response.status,200);
  const body=await response.json() as {aliases:Array<{appId:string}>};
  assert.equal(body.aliases[0].appId,'Sales');
  assert.deepEqual(queries[0].args,['tenant-a']);
  assert.ok(checks.includes('PageDefinition:read'));
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
