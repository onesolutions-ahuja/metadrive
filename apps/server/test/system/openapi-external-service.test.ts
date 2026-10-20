import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import {OpenApiExternalService} from '../../src/system-support/openapi-external-service.js';
import {executeFlowAction} from '../../src/system-files/flow-action-runtime.js';

const spec={
 openapi:'3.1.0',
 info:{title:'Inventory API',version:'1.0.0'},
 servers:[{url:'https://inventory.example.com/v1'}],
 paths:{
  '/items/{itemId}':{
   parameters:[{name:'itemId',in:'path',required:true,schema:{type:'string'}}],
   get:{
    operationId:'getItem',
    summary:'Get an item',
    parameters:[{name:'include',in:'query',required:false,schema:{type:'boolean'}}]
   },
   post:{
    operationId:'updateItem',
    requestBody:{required:true,content:{'application/json':{schema:{type:'object'}}}}
   }
  }
 }
};

test('imports OpenAPI operations as tenant-scoped relational Flow action metadata',async()=>{
 const statements:Array<{sql:string;params:readonly unknown[]}>=[];
 let transactionCount=0;
 const client={query:async(sql:string,params:readonly unknown[]=[])=>{
  statements.push({sql,params});
  return {rows:[],rowCount:0};
 }};
 const db={
  transaction:async<T>(operation:(client:PoolClient)=>Promise<T>)=>{
   transactionCount++;
   return operation(client as unknown as PoolClient);
  }
 } as unknown as SqlPersistence;
 const grants:string[]=[];
 const rbac={require:async(_tenant:string,_user:string,resource:string,action:string)=>{
  grants.push(resource+':'+action);
 }} as unknown as RbacEngine;
 const service=new OpenApiExternalService(db,rbac);
 const result=await service.import('tenant-1','user-1',{
  apiName:'Inventory_Service',label:'Inventory Service',spec
 });
 assert.deepEqual(result,{apiName:'Inventory_Service',label:'Inventory Service',operationCount:2});
 assert.deepEqual(grants,['FlowDefinition:manage']);
 assert.equal(transactionCount,1);
 assert.ok(statements.some(item=>item.sql.includes('INSERT INTO md_external_service_operations')
  &&item.params[2]==='getItem'&&item.params[3]==='Get an item'
  &&item.params[4]==='GET'&&item.params[5]==='items/{itemId}'));
 assert.ok(statements.some(item=>item.sql.includes('INSERT INTO md_external_service_parameters')
  &&item.params[3]==='itemId'&&item.params[4]==='path'&&item.params[5]===true));
 assert.ok(statements.some(item=>item.sql.includes('INSERT INTO md_external_service_parameters')
  &&item.params[3]==='body'&&item.params[4]==='body'&&item.params[5]===true));
 assert.ok(!statements.some(item=>item.params.some(value=>typeof value==='string'
  &&value.includes('"openapi":"3.1.0"'))));
});

test('rejects unsafe OpenAPI documents before writing tenant metadata',async()=>{
 let writes=0;
 const db={
  transaction:async<T>(operation:(client:PoolClient)=>Promise<T>)=>{
   return operation({query:async()=>{writes++;return {rows:[]};}} as unknown as PoolClient);
  }
 } as unknown as SqlPersistence;
 const rbac={require:async()=>undefined} as unknown as RbacEngine;
 const service=new OpenApiExternalService(db,rbac);
 const invalid=[
  {...spec,servers:[{url:'http://inventory.example.com'}]},
  {...spec,paths:{'/items':{get:{$ref:'https://example.com/operation'}}}},
  {...spec,paths:{'/items':{get:{operationId:'getItem',parameters:[
   {name:'q',in:'header',schema:{type:'string'}}
  ]}}}}
 ];
 for(const document of invalid)await assert.rejects(
  service.import('tenant-1','user-1',{apiName:'Inventory_Service',label:'Inventory',spec:document})
 );
 assert.equal(writes,0);
});

test('External Service Flow Actions encode inputs and enqueue via the HTTPS callout transport',async()=>{
 const queries:string[]=[];
 const client={
  query:async(sql:string)=>{
   queries.push(sql);
   if(sql.includes('FROM md_external_service_operations'))return {rows:[
    {http_method:'GET',path_template:'items/{itemId}',parameter_name:'itemId',
     parameter_location:'path',required:true,server_origin:'https://inventory.example.com',
     server_path:'v1',base_url:'https://inventory.example.com/'},
    {http_method:'GET',path_template:'items/{itemId}',parameter_name:'include',
     parameter_location:'query',required:false,server_origin:'https://inventory.example.com',
     server_path:'v1',base_url:'https://inventory.example.com/'}
   ]};
   return {rows:[]};
  }
 } as unknown as PoolClient;
 let queuedConfig:Record<string,unknown>|undefined;
 let queuedExecution:{client:PoolClient;runId:string;nodeId:number}|undefined;
 const fault=await executeFlowAction({
  client,rbac:{} as RbacEngine,tenantId:'tenant-1',userId:'user-1',flowApi:'Inventory_Flow',
  runId:'run-1',elementId:7,connectors:[],variables:{'$Record':{Id:'abc/123'}},
  config:{actionType:'External Service Action',externalServiceApiName:'Inventory_Service',
   externalOperationApiName:'getItem',namedCredentialId:'11111111-1111-4111-8111-111111111111',
   externalInputs:{itemId:'{!$Record.Id}',include:'true'}},
  resolve:(value)=>value==='{!$Record.Id}'?'abc/123':value,
  httpCallout:async(_tenant,_user,config,_variables,_key,execution)=>{
   queuedConfig=config;queuedExecution=execution;
   return {status:202,body:''};
  }
 });
 assert.equal(fault,undefined);
 assert.equal(queuedConfig?.path,'v1/items/abc%2F123?include=true');
 assert.equal(queuedConfig?.method,'GET');
 assert.equal(queuedConfig?.namedCredentialId,'11111111-1111-4111-8111-111111111111');
 assert.deepEqual(queuedExecution,{client,runId:'run-1',nodeId:7});
 assert.ok(queries.some(sql=>sql.startsWith('SAVEPOINT flow_action_7')));
 assert.ok(queries.some(sql=>sql.startsWith('RELEASE SAVEPOINT flow_action_7')));
});
