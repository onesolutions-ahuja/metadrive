import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import type {Express,NextFunction,Request,Response} from 'express';
import {test} from 'node:test';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {parsePlatformEventReplayId,registerPlatformEventStreamRoutes}
 from '../../src/system-support/platform-event-stream-routes.js';

test('Platform Event replay IDs accept Salesforce sentinels and bounded decimal cursors',()=>{
 assert.equal(parsePlatformEventReplayId('-1'),'-1');
 assert.equal(parsePlatformEventReplayId('-2'),'-2');
 assert.equal(parsePlatformEventReplayId('0'),'0');
 assert.equal(parsePlatformEventReplayId('9223372036854775807'),'9223372036854775807');
 assert.equal(parsePlatformEventReplayId(undefined),'-1');
 for(const value of ['-3','01','+1','1.5','9223372036854775808'])
  assert.throws(()=>parsePlatformEventReplayId(value),/Invalid Platform Event replay ID/);
});

test('Platform Event SSE stream authorizes subscriptions and emits durable replay IDs',async()=>{
 let route:((req:Request,res:Response,next:NextFunction)=>void)|undefined;
 const app=({get:(_path:string,handler:typeof route)=>{route=handler;return app;}}) as unknown as Express;
 const statements:string[]=[];
 let eventReadCount=0;
 const db=({query:async(sql:string)=>{
  statements.push(sql);
  if(sql.includes('FROM md_system_definitions'))
   return {rows:[{api_name:'Invoice_Event__e'}]};
  if(sql.includes('max(replay_id)'))return {rows:[{replay_id:'40'}]};
  eventReadCount++;
  return {rows:eventReadCount===1?[{
   replay_id:'41',id:'event-1',published_at:new Date('2026-01-01T00:00:00Z'),
   payload:{Amount:42}
  }]:[]};
 }}) as unknown as SqlPersistence;
 let authorizedResource='';
 const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{
  authorizedResource=resource+':'+action;
 }} as unknown as RbacEngine;
 registerPlatformEventStreamRoutes(app,db,rbac);
 assert.ok(route);

 class StreamResponse extends EventEmitter {
  headersSent=false;
  content='';
  status(_code:number){return this;}
  setHeader(_name:string,_value:string){return this;}
  flushHeaders(){this.headersSent=true;}
  write(chunk:string){
   this.content+=chunk;
   if(chunk.includes('replayId":"41'))this.emit('close');
   return true;
  }
  end(){this.emit('close');}
 }
 const response=new StreamResponse();
 route!({
  params:{eventApiName:'Invoice_Event__e'},query:{replayId:'-2'},
  actor:{tenant_id:'tenant-1',user_id:'user-1'}
 } as unknown as Request,response as unknown as Response,error=>{
  throw error;
 });
 await new Promise(resolve=>setTimeout(resolve,25));
 assert.equal(authorizedResource,'PlatformEvent:Invoice_Event__e:subscribe');
 assert.match(response.content,/id: 41/);
 assert.match(response.content,/event: Invoice_Event__e/);
 assert.match(response.content,/"payload":\{"Amount":42\}/);
 assert.ok(statements.some(sql=>sql.includes('replay_id>$3::bigint')));
});
