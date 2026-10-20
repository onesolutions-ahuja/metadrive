import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {test} from 'node:test';
import type {Request,Response} from 'express';
import {countTenantApiRequests} from '../../src/system-support/tenant-inspection-routes.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

test('authenticated API usage middleware stores only tenant and daily aggregate',async()=>{
 const calls:Array<{sql:string;args:readonly unknown[]}>=[];
 const db=({query:async(sql:string,args:readonly unknown[]=[])=>
  (calls.push({sql,args}),{rows:[]})}) as unknown as SqlPersistence;
 const handler=countTenantApiRequests(db);
 const response=new EventEmitter() as Response;
 let continued=false;
 handler({actor:{tenant_id:'tenant-1',user_id:'user-1'},method:'POST'} as Request&{
  actor:{tenant_id:string;user_id:string}
 },response,()=>{continued=true});
 assert.equal(continued,true);
 response.emit('finish');
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(calls.length,1);
 assert.match(calls[0].sql,/md_tenant_api_usage_daily/);
 assert.match(calls[0].sql,/CURRENT_DATE/);
 assert.doesNotMatch(calls[0].sql,/path|payload|user_id/i);
 assert.deepEqual(calls[0].args,['tenant-1']);
});

test('API usage middleware skips requests without an authenticated tenant',()=>{
 const calls:string[]=[];
 const handler=countTenantApiRequests(({query:async(sql:string)=>
  (calls.push(sql),{rows:[]})}) as unknown as SqlPersistence);
 let continued=false;
 handler({method:'OPTIONS'} as Request,new EventEmitter() as Response,()=>{continued=true});
 assert.equal(continued,true);
 assert.deepEqual(calls,[]);
});
