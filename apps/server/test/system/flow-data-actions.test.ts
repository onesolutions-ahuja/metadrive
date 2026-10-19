import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import type {RecordEngine} from '../../src/system-files/record-engine.js';
import type {FlowRecordQuery} from '../../src/system-files/flow-record-query.js';
import {executeFlowDataAction} from '../../src/system-files/flow-data-actions.js';

const records={} as RecordEngine;
const recordQuery={find:async()=>[
  {Id:'id-1',Name:'Acme',Amount:12},
  {Id:'id-2',Name:'Beta',Amount:20}
]} as unknown as FlowRecordQuery;
const client={} as PoolClient;
const makeContext=(node:{id:number;type:string;config:Record<string,unknown>},
  vars:Record<string,unknown>,loops=new Map<number,number>())=>({
    tenantId:'tenant',userId:'user',client,node,records,recordQuery,vars,loops,
    evaluate:(value:unknown)=>typeof value==='string'&&value.startsWith('@')
      ?vars[value.slice(1)]:value,
    set:(name:unknown,value:string|number|boolean|null)=>{
      if(typeof name!=='string')throw new Error('Invalid variable');
      vars[name]=value;
    }
  });

test('Get Records stores a projected single record and a bounded collection', async()=>{
  const vars:Record<string,unknown>={};
  const action=await executeFlowDataAction(makeContext({
    id:2,type:'Get Records',config:{object:'Account',recordLimit:'1',outputVariable:'account',
      fields:['Name']}
  },vars));
  assert.equal(action.handled,true);
  assert.deepEqual(vars.account,{Id:'id-1',Name:'Acme'});
});

test('collection filter, sort and loop preserve record order and loop branch semantics', async()=>{
  const vars:Record<string,unknown>={accounts:[
    {Id:'id-1',Name:'Acme',Amount:12},{Id:'id-2',Name:'Beta',Amount:20}
  ]};
  await executeFlowDataAction(makeContext({
    id:3,type:'Collection Filter',config:{collection:'accounts',outputCollection:'largeAccounts',
      conditionLogic:'1 OR 2',conditions:[
        {field:'Amount',operator:'Greater Than',value:15},
        {field:'Name',operator:'Starts With',value:'Ac'}
      ]}
  },vars));
  assert.deepEqual((vars.largeAccounts as Array<{Id:string}>).map(row=>row.Id),['id-1','id-2']);
  await executeFlowDataAction(makeContext({
    id:4,type:'Collection Sort',config:{collection:'largeAccounts',outputCollection:'sorted',
      sortField:'Amount',sortOrder:'Descending'}
  },vars));
  assert.deepEqual((vars.sorted as Array<{Id:string}>).map(row=>row.Id),['id-2','id-1']);
  const loops=new Map<number,number>();
  const first=await executeFlowDataAction(makeContext({
    id:5,type:'Loop',config:{collection:'sorted',loopVariable:'current'}
  },vars,loops));
  const firstId=(vars.current as {Id:string}).Id;
  const second=await executeFlowDataAction(makeContext({
    id:5,type:'Loop',config:{collection:'sorted',loopVariable:'current'}
  },vars,loops));
  const secondId=(vars.current as {Id:string}).Id;
  const last=await executeFlowDataAction(makeContext({
    id:5,type:'Loop',config:{collection:'sorted',loopVariable:'current'}
  },vars,loops));
  assert.equal(first.selected,'For Each');
  assert.equal(firstId,'id-2');
  assert.equal(second.selected,'For Each');
  assert.equal(secondId,'id-1');
  assert.equal(last.selected,'After Last');
});

test('Create Records collection uses the shared record engine and records created IDs',async()=>{
  const createdFields:Array<Record<string,unknown>>=[];
  const fakeRecords={createInTransaction:async(
    _client:PoolClient,_tenant:string,_user:string,_object:string,values:Record<string,unknown>)=>{
      createdFields.push(values);return 'new-'+createdFields.length;
    }} as unknown as RecordEngine;
  const vars:Record<string,unknown>={pending:[{Name:'Acme'},{Name:'Beta'}]};
  await executeFlowDataAction({...makeContext({
    id:6,type:'Create Records',config:{object:'Account',recordSource:'collection',
      collection:'pending',resultVariable:'created'}
  },vars),records:fakeRecords});
  assert.deepEqual(createdFields,[{Name:'Acme'},{Name:'Beta'}]);
  assert.deepEqual((vars.created as Array<{Id:string}>).map(row=>row.Id),['new-1','new-2']);
});

test('Create Records exposes the newly created record to later Flow steps',async()=>{
  const fakeRecords={createInTransaction:async()=> 'sale-id-1'} as unknown as RecordEngine;
  const vars:Record<string,unknown>={};
  await executeFlowDataAction({...makeContext({
    id:9,type:'Create Records',config:{object:'Sale',recordSource:'fields',
      fieldValues:[{field:'Name',value:'Sale 1'}],resultVariable:'CreatedSaleId'}
  },vars),records:fakeRecords});
  assert.deepEqual(vars.record9,{Name:'Sale 1',Id:'sale-id-1'});
  assert.equal(vars.CreatedSaleId,'sale-id-1');
});

test('Update and Delete Records support bounded collection and filter sources',async()=>{
  const updated:Array<{id:string;values:Record<string,unknown>}>=[],deleted:string[]=[];
  const fakeRecords={
    update:async(_tenant:string,_user:string,_object:string,id:string,values:Record<string,unknown>)=>{
      updated.push({id,values});
    },
    remove:async(_tenant:string,_user:string,_object:string,id:string)=>{deleted.push(id);}
  } as unknown as RecordEngine;
  const vars:Record<string,unknown>={accounts:[{Id:'id-1'},{Id:'id-2'}]};
  await executeFlowDataAction({...makeContext({
    id:7,type:'Update Records',config:{object:'Account',recordSource:'collection',
      collection:'accounts',fieldValues:[{field:'Status',value:'Active'}]}
  },vars),records:fakeRecords});
  assert.deepEqual(updated,[
    {id:'id-1',values:{Status:'Active'}},{id:'id-2',values:{Status:'Active'}}
  ]);
  await executeFlowDataAction({...makeContext({
    id:8,type:'Delete Records',config:{object:'Account',recordSource:'filter',
      conditions:[{field:'Name',operator:'Equals',value:'Acme'}]}
  },vars),records:fakeRecords});
  assert.deepEqual(deleted,['id-1','id-2']);
});
