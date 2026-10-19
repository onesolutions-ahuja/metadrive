import {withFlowCapabilities} from './flow-capability-test-helper.js';
import assert from 'node:assert/strict';
import {test} from 'node:test';
import {once} from 'node:events';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {createSystemServer} from '../../src/system-support/server.js';
import {encodeMetadataValue,decodeMetadataValues} from '../../src/system-files/component-runtime.js';
import {AppRuntime} from '../../src/system-files/app-runtime.js';
import {FlowRuntime} from '../../src/system-files/flow-runtime.js';

test('metadata property codec preserves nested Component, Page and Flow graph values',()=>{
  const original={elements:[{id:1,type:'Screen',config:{fields:[{label:'Payment',required:true}]}}],
    connectors:[],defaults:{amount:12.5,selected:false,empty:null}};
  const values:Array<{path:string;kind:string;text:string|null}>=[];
  encodeMetadataValue(original,'/builder',values);
  const loaded=decodeMetadataValues(values.map(row=>({
    property_path:row.path,value_kind:row.kind,value_text:row.text
  })));
  assert.deepEqual(loaded.builder,original);
  assert.throws(()=>encodeMetadataValue(JSON.parse('{"__proto__":{"x":1}}') as unknown,'/unsafe',[]),/Invalid metadata property name/);
});

test('registered Origin can preflight Page, App and Flow PUT endpoints',async()=>{
  const db={query:async(sql:string)=>{
    if(sql.includes('FROM md_tenant_domains'))return {rows:[{tenant_id:'tenant'}],rowCount:1};
    throw new Error('Preflight should not access protected SQL routes: '+sql);
  }} as unknown as SqlPersistence;
  const app=createSystemServer(db);
  const server=app.listen(0,'127.0.0.1');
  try{
    if(!server.listening)await once(server,'listening');
    const port=(server.address() as import('node:net').AddressInfo).port;
    for(const path of ['/api/metadata/pages/TestPage','/api/metadata/flows/TestFlow','/api/metadata/apps/TestApp']){
      const response=await fetch('http://127.0.0.1:'+port+path,{
        method:'OPTIONS',
        headers:{origin:'https://tenant.example','Access-Control-Request-Method':'PUT'}
      });
      assert.equal(response.status,204,path);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'),'https://tenant.example');
      assert.ok((response.headers.get('Access-Control-Allow-Methods')??'').split(',').includes('PUT'));
    }
  }finally{
    if(server.listening)await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
});

test('tenant App authoring rejects malformed metadata without database writes',async()=>{
  const db={transaction:async()=>{throw new Error('SQL should not be touched')}} as unknown as SqlPersistence;
  await assert.rejects(
    ()=>new AppRuntime(db).saveMetadata('tenant','Bad;DROP',{apiName:'Bad;DROP'},false),
    /Invalid App metadata/
  );
});

test('Flow drafts are checked before writes and supported Screen graph validation is enabled',async()=>{
  const db=withFlowCapabilities({transaction:async()=>{throw new Error('SQL should not be touched')}} as unknown as SqlPersistence);
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const engine=new FlowRuntime(db,rbac);
  await assert.rejects(
    ()=>engine.saveEditor('tenant','user','Unsafe',{apiName:'Unsafe',label:'Unsafe',flowType:'Screen Flow',
      status:'Draft',elements:[{id:1,type:'Start',label:'Start',config:{}}],connectors:[{from:1,to:9}],resources:[]}),
    /Invalid Flow connector/
  );
  const validation=await engine.validateDraft('tenant','user','ScreenFlow',{
    apiName:'ScreenFlow',flowType:'Screen Flow',elements:[
      {id:1,type:'Start',config:{}},{id:2,type:'Screen',config:{fields:[]}},{id:3,type:'End',config:{}}],
    connectors:[{from:1,to:2,kind:'normal'},{from:2,to:3,kind:'normal'}]});
  assert.equal(validation.valid,true);
  assert.deepEqual(validation.errors,[]);
});

test('activating a newer Flow version deactivates existing versions before publishing',async()=>{
  const statements:string[]=[];
  const db={
    query:async()=>({rows:[]}),
    transaction:async(run:(client:{query:(sql:string)=>Promise<{rows:Array<{id:string;version:number;active:boolean}>}>})=>Promise<void>)=>
      run({query:async(sql:string)=>{
        statements.push(sql);
        return sql.includes('SELECT id,version,active FROM md_flow_definitions')
          ?{rows:[{id:'draft',version:2,active:false}]}:{rows:[]};
      }})
  } as unknown as SqlPersistence;
  const engine=new FlowRuntime(db,{require:async()=>{}} as unknown as RbacEngine);
  engine.validateDraft=async()=>({valid:true,errors:[],warnings:[]});
  engine.loadEditor=async()=>({} as never);
  await engine.saveEditor('tenant','user','OrderFlow',{
    apiName:'OrderFlow',label:'Order Flow',flowType:'Autolaunched Flow',status:'Active',
    elements:[{id:1,type:'Start',label:'Start',config:{}},{id:2,type:'End',label:'End',config:{}}],
    connectors:[{from:1,to:2,label:'Default',kind:'normal'}],resources:[]
  });
  const deactivate=statements.findIndex(sql=>sql.includes('UPDATE md_flow_definitions SET active=false'));
  const activate=statements.findIndex(sql=>sql.includes('UPDATE md_flow_definitions SET label=$3,flow_type=$4,active=$5'));
  assert.notEqual(deactivate,-1);
  assert.notEqual(activate,-1);
  assert.ok(deactivate<activate);
});

test('Flow version restore source is loaded by tenant, API name, and published version',async()=>{
  const graph={label:'Order Flow',flowType:'Screen Flow',triggerObject:null,startConfig:{},
    elements:[{id:1,type:'Start',label:'Start',config:{}},{id:2,type:'End',label:'End',config:{}}],
    connectors:[{id:'start-end',from:1,to:2,label:'',kind:'normal'}],resources:[],tests:[]};
  const encoded:Array<{path:string;kind:string;text:string|null}>=[];
  encodeMetadataValue(graph,'/builder',encoded);
  const calls:Array<{sql:string;values:unknown[]}>= [];
  const db={query:async(sql:string,values:unknown[]=[])=>{
    calls.push({sql,values});
    if(sql.includes('FROM md_flow_definitions'))return {rows:[{
      id:'flow-v1',api_name:'OrderFlow',label:'Order Flow',flow_type:'Screen Flow',
      version:1,active:false
    }]};
    if(sql.includes('FROM md_flow_editor_values'))return {rows:encoded.map(row=>({
      property_path:row.path,value_kind:row.kind,value_text:row.text
    }))};
    throw new Error('Unexpected Flow version query: '+sql);
  }} as unknown as SqlPersistence;
  const version=await new FlowRuntime(db).loadEditorVersion('tenant','OrderFlow',1);
  assert.equal(version.versionNumber,1);
  assert.equal(version.status,'Obsolete');
  assert.deepEqual(version.elements,graph.elements);
  assert.deepEqual(version.connectors,graph.connectors);
  assert.deepEqual(calls[0].values,['tenant','OrderFlow',1]);
  assert.ok(calls.every(call=>call.values.includes('tenant')));
});
