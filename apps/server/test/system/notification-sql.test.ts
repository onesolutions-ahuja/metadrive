import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {registerNotificationSqlRoutes} from '../../src/system-files/notification-sql-routes.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
test('notification inbox and read actions are scoped to session tenant and user',async()=>{
 const queries:Array<{sql:string;params:unknown[]}>=[],id='d09ecb47-daf8-40bd-8dcc-73db87c21a4d';
 const db={query:async(sql:string,params:unknown[])=>{
  queries.push({sql,params});
  if(sql.includes('count(*)'))return {rows:[{count:'1'}]};
  return {rows:[{id,recipient_id:'user-1',title:'Alert',body:'Message',flow_api:null,sent_by:null,created_at:new Date(),read_at:null}]};
 }} as unknown as SqlPersistence;
 const app=express();app.use(express.json());app.use((req,_res,next)=>{(req as typeof req&{actor:unknown}).actor={tenant_id:'tenant-1',user_id:'user-1'};next();});
 registerNotificationSqlRoutes(app,db);
 const server=await new Promise<import('node:http').Server>(resolve=>{const instance=app.listen(0,'127.0.0.1',()=>resolve(instance));});
 try{
  const url='http://127.0.0.1:'+(server.address() as import('node:net').AddressInfo).port;
  const inbox=await fetch(url+'/api/notifications');assert.equal(inbox.status,200);
  const result=await inbox.json() as {unreadCount:number};assert.equal(result.unreadCount,1);
  const read=await fetch(url+'/api/notifications/'+id+'/read',{method:'POST'});assert.equal(read.status,200);
  for(const q of queries){assert.equal(q.params[0],'tenant-1');assert.equal(q.params[1],'user-1');}
 }finally{await new Promise<void>(done=>server.close(()=>done()));}
});
