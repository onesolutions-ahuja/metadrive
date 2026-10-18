import assert from 'node:assert/strict';
import {test} from 'node:test';
import {SystemDefinitionService} from './system-definition-service.js';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';

test('system definitions scope reads by tenant and resource permission',async()=>{
 const calls:Array<{sql:string;args:unknown[]}>=[];const db={
  query:async(sql:string,args:unknown[])=>{calls.push({sql,args});return {rows:[{api_name:'Demo',label:'Demo',revision:1,enabled:true,properties:{title:'Dashboard'}}]};}
 } as unknown as SqlPersistence;
 const grants:Array<[string,string,string,string]>=[];
 const rbac={require:async(t:string,u:string,r:string,a:string)=>{grants.push([t,u,r,a]);}} as unknown as RbacEngine;
 const svc=new SystemDefinitionService(db,rbac);
 const result=await svc.list('tenant-1','user-1','dashboards');
 assert.equal(result[0].apiName,'Demo');
 assert.deepEqual(calls[0].args,['tenant-1','dashboards']);
 assert.deepEqual(grants[0],['tenant-1','user-1','SystemDefinition:dashboards','read']);
});

test('system definitions reject embedded secrets before writing SQL',async()=>{
 const db={query:async()=>{throw new Error('Unexpected SQL write');}} as unknown as SqlPersistence;
 const rbac={require:async()=>{}} as unknown as RbacEngine;
 const svc=new SystemDefinitionService(db,rbac);
 await assert.rejects(()=>svc.save('t','u','integration-connections',{apiName:'Remote',label:'Remote',configuration:{apiKey:'unprotected'}}),/Credential secrets/);
});

test('system definitions reject missing manage permission',async()=>{
 const db={query:async()=>{throw new Error('Unexpected SQL write');}} as unknown as SqlPersistence;
 const rbac={require:async()=>{throw new Error('Permission denied');}} as unknown as RbacEngine;
 const svc=new SystemDefinitionService(db,rbac);
 await assert.rejects(()=>svc.save('t','u','reports',{apiName:'Report',label:'Report'}),/Permission denied/);
});
