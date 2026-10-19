import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import {CustomMetadataService} from '../../src/system-files/custom-metadata-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

function service(query:SqlPersistence['query']=async()=>({rows:[],rowCount:0} as never),
  rbac:Partial<RbacEngine>={require:async()=>{}}) {
  const db={query,transaction:async(run:(client:{query:typeof query})=>Promise<unknown>)=>run({query})};
  return new CustomMetadataService(db as unknown as SqlPersistence,rbac as RbacEngine);
}

test('custom labels use tenant-scoped SQL and central RBAC',async()=>{
  const calls:Array<{sql:string;args:readonly unknown[]}>=[];
  const svc=service(async(sql,args=[])=>{
    calls.push({sql,args});
    return {rows:[{api_name:'Welcome',language:'en',label:'Welcome',value:'Hello'}],rowCount:1} as never;
  },{require:async(...args:Parameters<RbacEngine['require']>)=>{
    assert.deepEqual(args,['tenant-1','user-1','CustomLabel','manage']);
  }});
  const result=await svc.saveCustomLabel('tenant-1','user-1',
    {apiName:'Welcome',label:'Welcome',value:'Hello'});
  assert.equal(result.value,'Hello');
  assert.match(calls[0].sql,/ON CONFLICT\(tenant_id,api_name,language\)/);
  assert.deepEqual(calls[0].args,['tenant-1','Welcome','en','Welcome','Hello']);
});

test('custom metadata definitions persist only declared relational field columns',async()=>{
  const statements:string[]=[];
  const fakeQuery=async(sql:string,args:readonly unknown[]=[])=>{
    statements.push(sql);
    if(sql.includes('INSERT INTO md_custom_metadata_types'))return {rows:[{api_name:'Endpoint__mdt',label:'Endpoint',description:''}],rowCount:1} as never;
    if(sql.includes('INSERT INTO md_custom_metadata_fields'))return {rows:[],rowCount:1} as never;
    if(sql.includes('SELECT api_name,label,data_type,required,max_length,sort_order'))
      return {rows:[{api_name:'Enabled',label:'Enabled',data_type:'boolean',required:true,max_length:null,sort_order:0}],rowCount:1} as never;
    return {rows:[],rowCount:1} as never;
  };
  const result=await service(fakeQuery).createCustomMetadataType('tenant-1','user-1',{
    apiName:'Endpoint__mdt',label:'Endpoint',fields:[{apiName:'Enabled',label:'Enabled',dataType:'boolean',required:true}]
  });
  assert.equal(result.fields[0].dataType,'boolean');
  assert.ok(statements.some(sql=>sql.includes('INSERT INTO md_custom_metadata_fields')));
  assert.ok(statements.every(sql=>!/\bjsonb?\b/i.test(sql)));
});

test('metadata record validation and permission denial happen before SQL writes',async()=>{
  const calls:string[]=[];
  const denied=service(async(sql)=>{calls.push(sql);return {rows:[],rowCount:0} as never;},
    {require:async()=>{throw new Error('Permission denied');}});
  await assert.rejects(()=>denied.saveCustomMetadataRecord('t','u','MyType',{recordKey:'One',masterLabel:'One',values:{}}),
    /Permission denied/);
  assert.deepEqual(calls,[]);

  const allowed=service(undefined,{require:async()=>{}});
  await assert.rejects(()=>allowed.createCustomMetadataType('t','u',{
    apiName:'Broken',label:'Broken',fields:[{apiName:'Payload',label:'Payload',dataType:'json' as never}]
  }),/Invalid or duplicate custom field/);
});

test('custom setting hierarchy resolves user over profile over organization',async()=>{
  let observedArgs:readonly unknown[]=[];
  const svc=service(async(_sql,args=[])=>{
    observedArgs=args;
    return {rows:[
      {field_api:'theme',data_type:'text',value_text:'dark',value_number:null,value_boolean:null,value_date:null,value_datetime:null},
      {field_api:'enabled',data_type:'boolean',value_text:null,value_number:null,value_boolean:true,value_date:null,value_datetime:null}
    ],rowCount:2} as never;
  });
  const result=await svc.getCustomSettingValues('tenant-1','actor-1','Appearance','target-1');
  assert.deepEqual(observedArgs,['tenant-1','Appearance','target-1']);
  assert.deepEqual(result.values,{theme:'dark',enabled:true});
});

test('setting hierarchy writes validate scope and use central setting permissions',async()=>{
  const calls:Array<{sql:string;args:readonly unknown[]}>=[];
  const svc=service(async(sql,args=[])=>{
    calls.push({sql,args});
    if(sql.includes('SELECT api_name,label,data_type,required,max_length,sort_order'))
      return {rows:[{api_name:'theme',label:'Theme',data_type:'text',required:false,max_length:40,sort_order:0}],rowCount:1} as never;
    if(sql.includes('SELECT 1 FROM md_custom_settings'))return {rows:[{'?column?':1}],rowCount:1} as never;
    if(sql.includes('INSERT INTO md_custom_setting_entries'))return {rows:[{id:'entry-1'}],rowCount:1} as never;
    return {rows:[],rowCount:1} as never;
  });
  const result=await svc.writeCustomSettingValues('tenant-1','actor-1','Appearance','organization',{theme:'light'});
  assert.equal(result.scope,'organization');
  assert.ok(calls.some(call=>call.sql.includes('md_custom_setting_values')));
  assert.ok(calls.every(call=>call.args[0]==='tenant-1'));
});

test('custom metadata migration is additive and exclusively relational',async()=>{
  const sql=await readFile(new URL('../../src/system-support/migrations/20261023-custom-metadata-foundation.sql',import.meta.url),'utf8');
  for(const table of ['md_custom_labels','md_custom_metadata_types','md_custom_metadata_fields',
    'md_custom_metadata_records','md_custom_metadata_values','md_custom_settings',
    'md_custom_setting_fields','md_custom_setting_entries','md_custom_setting_values'])
    assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  assert.match(sql,/scope IN \('organization','profile','user'\)/);
  assert.doesNotMatch(sql,/\bjsonb?\b/i);
});
