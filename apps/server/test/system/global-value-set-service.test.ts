import assert from 'node:assert/strict';
import {test} from 'node:test';
import {GlobalValueSetService} from '../../src/system-support/global-value-set-service.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';

const tenantId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const otherTenantId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const userId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const setId='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const actor={tenant_id:tenantId,user_id:userId};

function serviceFixture(){
  type SetRow={id:string;tenant_id:string;api_name:string;label:string;description:string;created_at:Date;updated_at:Date};
  type ValueRow={tenant_id:string;value_set_id:string;value:string;label:string;active:boolean;sort_order:number};
  const parent:SetRow={id:setId,tenant_id:tenantId,api_name:'Regions',label:'Regions',description:'',
    created_at:new Date('2026-01-01T00:00:00.000Z'),updated_at:new Date('2026-01-01T00:00:00.000Z')};
  let exists=true;
  const values:ValueRow[]=[];
  const statements:{sql:string;args:readonly unknown[]}[]=[];
  const decisions:{tenantId:string;userId:string;resource:string;action:string}[]=[];
  let deny=false;
  let fieldReferenced=false;
  const query=async(sql:string,args:readonly unknown[]=[]):Promise<{rows:any[];rowCount:number}>=>{
    statements.push({sql,args});
    if(sql.includes('INSERT INTO md_global_value_sets')){
      return {rows:[{id:parent.id,api_name:args[1],label:args[2],description:args[3],
        created_at:parent.created_at,updated_at:parent.updated_at}],rowCount:1};
    }
    if(sql.includes('INSERT INTO md_global_value_set_values')){
      values.push({tenant_id:String(args[0]),value_set_id:String(args[1]),value:String(args[2]),
        label:String(args[3]),sort_order:Number(args[4]),active:Boolean(args[5])});
      return {rows:[],rowCount:1};
    }
    if(sql.includes('FROM md_field_global_value_sets')&&sql.includes('value_set_api=$2'))
      return {rows:fieldReferenced?[{exists:true}]:[],rowCount:fieldReferenced?1:0};
    if(sql.includes('SELECT value_set_id,value,label,active,sort_order')){
      const ids=args[1] as string[];
      return {rows:values.filter(value=>value.tenant_id===args[0]&&ids.includes(value.value_set_id)),rowCount:values.length};
    }
    if(sql.includes('FROM md_global_value_sets WHERE tenant_id=$1 AND id=$2 FOR UPDATE')){
      return {rows:exists&&args[0]===parent.tenant_id&&args[1]===parent.id?[{
        id:parent.id,api_name:parent.api_name,label:parent.label,description:parent.description,
        created_at:parent.created_at,updated_at:parent.updated_at
      }]:[],rowCount:exists?1:0};
    }
    if(sql.includes('UPDATE md_global_value_sets SET')){
      if(args[0]!==parent.tenant_id||args[1]!==parent.id)return {rows:[],rowCount:0};
      [parent.api_name,parent.label,parent.description]=[String(args[2]),String(args[3]),String(args[4])];
      parent.updated_at=new Date('2026-02-01T00:00:00.000Z');
      return {rows:[{id:parent.id,api_name:parent.api_name,label:parent.label,description:parent.description,
        created_at:parent.created_at,updated_at:parent.updated_at}],rowCount:1};
    }
    if(sql.includes('DELETE FROM md_global_value_set_values')){
      for(let index=values.length-1;index>=0;index--)
        if(values[index].tenant_id===args[0]&&values[index].value_set_id===args[1])values.splice(index,1);
      return {rows:[],rowCount:1};
    }
    if(sql.includes('DELETE FROM md_global_value_sets')){
      const deleted=exists&&args[0]===parent.tenant_id&&args[1]===parent.id;
      if(deleted)exists=false;
      return {rows:[],rowCount:deleted?1:0};
    }
    if(sql.includes('FROM md_global_value_sets WHERE tenant_id=$1')){
      return {rows:exists&&args[0]===parent.tenant_id?[{
        id:parent.id,api_name:parent.api_name,label:parent.label,description:parent.description,
        created_at:parent.created_at,updated_at:parent.updated_at
      }]:[],rowCount:exists?1:0};
    }
    return {rows:[],rowCount:1};
  };
  const db={
    query,
    transaction:async<T>(run:(tx:unknown)=>Promise<T>)=>run({query})
  } as unknown as SqlPersistence;
  const rbac={require:async(tenant:string,user:string,resource:string,action:string)=>{
    decisions.push({tenantId:tenant,userId:user,resource,action});
    if(deny)throw new Error('Permission denied');
  }} as unknown as RbacEngine;
  return {
    service:new GlobalValueSetService(db,rbac),statements,values,decisions,
    setDenied(value:boolean){deny=value;},
    setFieldReferenced(value:boolean){fieldReferenced=value;}
  };
}

test('create and list return typed values in order and check tenant RBAC',async()=>{
  const fixture=serviceFixture();
  const created=await fixture.service.create(actor,{
    apiName:'Regions',label:'Regions',values:[{value:'North'},{value:'South',label:'Southern',active:false}]
  });
  assert.deepEqual(created.valueSet.values,[
    {value:'North',label:'North',active:true,sortOrder:0},
    {value:'South',label:'Southern',active:false,sortOrder:1}
  ]);
  const listed=await fixture.service.list(actor);
  assert.equal(listed.valueSets[0].apiName,'Regions');
  assert.equal(listed.valueSets[0].values.length,2);
  assert.deepEqual(fixture.decisions.map(check=>[check.resource,check.action]),
    [['GlobalValueSet','create'],['GlobalValueSet','read']]);
  for(const statement of fixture.statements.filter(item=>item.sql.includes('md_global_value_set')))
    assert.ok(statement.sql.includes('tenant_id'));
});

test('create rejects malformed metadata and duplicate case-insensitive values',async()=>{
  const fixture=serviceFixture();
  await assert.rejects(fixture.service.create(actor,{
    apiName:'Bad Name',label:'Invalid',values:[{value:'One'}]
  }),/Invalid global value set API name/);
  await assert.rejects(fixture.service.create(actor,{
    apiName:'Regions',label:'Invalid',values:[{value:'West'},{value:' west '}]
  }),/duplicate global value set value/);
  await assert.rejects(fixture.service.create(actor,{
    apiName:'Regions',label:'Invalid',values:[{value:'West'}],unexpected:'field'
  }),/Invalid global value set/);
  assert.equal(fixture.statements.length,0);
});

test('update atomically replaces supplied values and preserves omitted fields',async()=>{
  const fixture=serviceFixture();
  const updated=await fixture.service.update(actor,setId,{
    label:'Updated Regions',values:[{value:'East'},{value:'West'}]
  });
  assert.equal(updated.valueSet.label,'Updated Regions');
  assert.equal(updated.valueSet.apiName,'Regions');
  assert.deepEqual(updated.valueSet.values.map(value=>value.value),['East','West']);
  assert.ok(fixture.statements.some(statement=>
    statement.sql.includes('DELETE FROM md_global_value_set_values')&&
    statement.args[0]===tenantId&&statement.args[1]===setId));
  assert.ok(fixture.statements.some(statement=>
    statement.sql.includes('FOR UPDATE')&&statement.args[0]===tenantId));
});

test('delete is tenant scoped and does not disclose missing sets',async()=>{
  const fixture=serviceFixture();
  await fixture.service.delete(actor,setId);
  await assert.rejects(fixture.service.delete({tenant_id:otherTenantId,user_id:userId},setId),
    /Global value set not found/);
  assert.deepEqual(fixture.statements.filter(statement=>statement.sql.includes('SELECT api_name FROM md_global_value_sets'))
    .map(statement=>statement.args[0]),[tenantId,otherTenantId]);
  assert.ok(fixture.statements.some(statement=>statement.sql.includes('md_global_value_set_audit')&&
    statement.sql.includes("'delete'")&&statement.args[0]===tenantId));
});

test('delete rejects a value set that is linked to fields',async()=>{
  const fixture=serviceFixture();
  fixture.setFieldReferenced(true);
  await assert.rejects(fixture.service.delete(actor,setId),/referenced by fields/);
  assert.equal(fixture.statements.some(statement=>statement.sql.includes('DELETE FROM md_global_value_sets')),false);
});

test('denied RBAC prevents data access',async()=>{
  const fixture=serviceFixture();
  fixture.setDenied(true);
  await assert.rejects(fixture.service.list(actor),/Permission denied/);
  assert.equal(fixture.statements.length,0);
});
