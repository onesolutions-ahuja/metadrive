import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import {DeclarativeBusinessRules} from '../../src/system-files/declarative-business-rules.js';
import {FlowCustomError} from '../../src/system-files/flow-error-runtime.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const tenant='00000000-0000-4000-8000-000000000001';
const user='00000000-0000-4000-8000-000000000002';
const definitions=[
 {api_name:'Amount',data_type:'number',default_value:null},
 {api_name:'Base',data_type:'number',default_value:null},
 {api_name:'Tax',data_type:'number',default_value:null},
 {api_name:'Total',data_type:'number',default_value:null},
 {api_name:'Secret',data_type:'encryptedtext',default_value:null}
];
const profile={id:user,email:'agent@example.invalid',display_name:'Agent',
 time_zone:'Europe/London',profile_id:tenant,profile_name:'Agent'};

function fixture({
  defaults=[],rules=[]
}:{
  defaults?:Array<{field_api:string;expression:string;data_type:string;default_value:string|null}>;
  rules?:Array<{
    rule_api:string;label:string;expression:string;error_message:string;
    error_field:string|null;operations:string;active:boolean;sort_order:number;
  }>;
}={}){
 const operations:string[]=[];
 const statements:Array<{sql:string;params:unknown[]}>=standin();
 function standin(){return [] as Array<{sql:string;params:unknown[]}>;}
 const query=async(sql:string,params:unknown[]=[]):Promise<{rows:Record<string,unknown>[];rowCount:number}>=>{
  operations.push(sql);
  statements.push({sql,params});
  if(sql.includes('FROM md_field_default_formulas d JOIN'))return {rows:defaults,rowCount:defaults.length};
  if(sql.includes('FROM md_validation_rules WHERE'))return {rows:rules,rowCount:rules.length};
  if(sql.includes('FROM md_field_definitions'))return {rows:definitions,rowCount:definitions.length};
  if(sql.includes('FROM md_users u LEFT JOIN'))return {rows:[profile],rowCount:1};
  return {rows:[],rowCount:0};
 };
 const fakeDb={query} as unknown as SqlPersistence;
 const client={query} as unknown as PoolClient;
 const permissions:string[]=[];
 const rbac={require:async(_t:string,_u:string,resource:string,action:string)=>{
  permissions.push(resource+':'+action);
 }} as unknown as RbacEngine;
 return {service:new DeclarativeBusinessRules(fakeDb,rbac),
   operations,statements,permissions,client};
}

test('formula defaults resolve dependencies in one creation context; explicit values win',async()=>{
 const {service,client}=fixture({defaults:[
  {field_api:'Tax',expression:'{!$Record.Base} * 0.2',data_type:'number',default_value:null},
  {field_api:'Total',expression:'{!$Record.Base} + {!$Record.Tax}',data_type:'number',default_value:null}
 ]});
 const output=await service.applyDefaults(client,tenant,user,'Invoice',{Base:100});
 assert.deepEqual(output,{Base:100,Tax:20,Total:120});
 const explicit=await service.applyDefaults(client,tenant,user,'Invoice',{Base:100,Tax:7});
 assert.equal(explicit.Tax,7);
 assert.equal(explicit.Total,107);
});

test('cyclic formula defaults fail closed instead of saving partial values',async()=>{
 const {service,client}=fixture({defaults:[
  {field_api:'Tax',expression:'{!$Record.Total}',data_type:'number',default_value:null},
  {field_api:'Total',expression:'{!$Record.Tax}',data_type:'number',default_value:null}
 ]});
 await assert.rejects(()=>service.applyDefaults(client,tenant,user,'Invoice',{}),
  /Cyclic formula defaults/);
});

test('active validation rule blocks save with a structured field error',async()=>{
 const {service,client,permissions}=fixture({rules:[{
  rule_api:'AmountLimit',label:'Amount limit',expression:'{!$Record.Amount} > 100',
  error_message:'Amount must be at most 100',error_field:'Amount',
  operations:'Both',active:true,sort_order:0
 }]});
 await assert.rejects(()=>service.validateRecord(client,tenant,user,'Invoice',
  {Amount:200},null,'Create'),error=>{
  assert.ok(error instanceof FlowCustomError);
  assert.equal(error.fieldName,'Amount');
  assert.equal(error.message,'Amount must be at most 100');
  return true;
 });
 assert.ok(permissions.includes('Invoice.Amount:read'));
 await service.validateRecord(client,tenant,user,'Invoice',{Amount:50},null,'Create');
});

test('record change functions compare proposed and previous values',async()=>{
 const {service,client}=fixture({rules:[{
  rule_api:'NoDecrease',label:'No decrease',
  expression:'AND(ISCHANGED({!$Record.Amount}), {!$Record.Amount} < PRIORVALUE({!$Record.Amount}))',
  error_message:'Amount must not decrease',error_field:null,
  operations:'Update',active:true,sort_order:0
 }]});
 await service.validateRecord(client,tenant,user,'Invoice',{Amount:120},{Amount:100},'Update');
 await assert.rejects(()=>service.validateRecord(client,tenant,user,'Invoice',
  {Amount:80},{Amount:100},'Update'),/Amount must not decrease/);
});

test('metadata rejects unknown, encrypted and cross-object formula references',async()=>{
 const {service}=fixture();
 const rule={
  apiName:'CheckIt',label:'Check it',expression:'{!$Record.Secret} = "s"',
  errorMessage:'Invalid',operations:'Both',active:true
 };
 await assert.rejects(()=>service.saveRule(tenant,user,'Invoice',rule),
  /Invalid formula field reference/);
 await assert.rejects(()=>service.saveDefault(tenant,user,'Invoice','Total',
  '{!Other.Amount}'),/Invalid formula reference/);
});
