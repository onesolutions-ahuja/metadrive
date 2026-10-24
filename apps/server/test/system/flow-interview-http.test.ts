import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import {NamedCredentialService} from '../../src/system-support/named-credential-service.js';
import {FlowRuntime} from '../../src/system-files/flow-runtime.js';
import {encodeMetadataValue} from '../../src/system-files/component-runtime.js';

const uuid='00000000-0000-4000-8000-000000000001';
const rbac={require:async()=>{}} as unknown as RbacEngine;
test('HTTP Callout fails closed for missing tenant credential and local network targets',async()=>{
 const missing={query:async()=>({rows:[]})} as unknown as SqlPersistence;
 const withWriter=(db:SqlPersistence)=>{
  const service=new NamedCredentialService(db,rbac);
  service.setIntegrationActivityWriter(async()=>undefined);
  return service;
 };
 await assert.rejects(()=>withWriter(missing).callout('tenant','user',
  {namedCredentialId:uuid,method:'POST',path:'checkout'}, {},'run-1'),/unavailable/);
 for(const target of ['http://api.example.com/','https://127.0.0.1/','https://localhost/']){
  const db={query:async()=>({rows:[{protocol:'HTTPS',base_url:target,
   auth_type:'None',header_name:'',secret_ciphertext:null,enabled:true}]})} as unknown as SqlPersistence;
  await assert.rejects(()=>withWriter(db).callout('tenant','user',
   {namedCredentialId:uuid,method:'GET',path:'checkout'}, {},'run-1'),
    /standard HTTPS|local network/);
 }
});
test('Flow read-only debugger simulates HTTP and record actions without executing either',async()=>{
 const graph={flowType:'Screen Flow',
  elements:[{id:1,type:'Start',label:'Start',config:{}},
   {id:2,type:'HTTP Callout',label:'Callout',config:{}},
   {id:3,type:'End',label:'End',config:{}}],
  connectors:[{from:1,to:2,kind:'normal',label:'Default'},
   {from:2,to:3,kind:'normal',label:'Default'}]};
 const rows:Array<{path:string;kind:string;text:string|null}>=[];
 encodeMetadataValue(graph,'/builder',rows);
 let sideEffects=0;
 const db={query:async(sql:string)=>{
  if(sql.startsWith('SELECT id,version,system_context_approved_by FROM md_flow_definitions'))
   return {rows:[{id:uuid,version:2,system_context_approved_by:null}]};
  if(sql.includes('FROM md_flow_editor_values'))return {rows:rows.map(row=>({
   property_path:row.path,value_kind:row.kind,value_text:row.text
  }))};
  throw new Error('Unexpected query '+sql);
 }} as unknown as SqlPersistence;
 const run=new FlowRuntime(db,rbac,undefined,async()=>{
  sideEffects++;return {status:200,body:'unexpected'};
 });
 const trace=await run.debugGraph('tenant','user','Checkout',{});
 assert.equal(trace.status,'completed');
 assert.equal(trace.dryRun,true);
 assert.equal(trace.debugTrace[1].status,'Simulated');
 assert.equal(sideEffects,0);
});
