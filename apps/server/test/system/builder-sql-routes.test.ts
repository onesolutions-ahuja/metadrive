import assert from 'node:assert/strict';
import {test} from 'node:test';
import express from 'express';
import {registerBuilderSqlRoutes} from '../../src/system-files/builder-sql-routes.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

test('builder SQL routes reject activation without validated published graph',async()=>{
 const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as typeof req&{actor:unknown}).actor={tenant_id:'t',user_id:'u'};next();});
 const db={query:async()=>({rows:[{revision:1}]})} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 registerBuilderSqlRoutes(app,db,rbac);
 const srv=app.listen(0,'127.0.0.1');
 try{
  if(!srv.listening)await import('node:events').then(({once})=>once(srv,'listening'));
  const port=(srv.address() as import('node:net').AddressInfo).port;
  const response=await fetch('http://127.0.0.1:'+port+'/api/metadata/flows/SaleFlow',{
   method:'PUT',headers:{'content-type':'application/json'},
   body:JSON.stringify({apiName:'SaleFlow',status:'Active',elements:[],connectors:[],resources:[]})
  });
  // This handler calls Express error middleware when validation fails.
  assert.equal(response.status,500);
 }finally{await new Promise<void>((resolve)=>srv.close(()=>resolve()));}
});
