import assert from 'node:assert/strict';
import {test} from 'node:test';
import {ObjectDefinitionService} from '../../src/system-files/object-definition.js';
import {RecordEngine} from '../../src/system-files/record-engine.js';
import type {RbacEngine} from '../../src/system-files/rbac-engine.js';
import type {SqlPersistence} from '../../src/system-files/sql-persistence.js';

test('relationship names, deletion behavior and reparenting settings persist',async()=>{
  const writes:Array<{sql:string;args:unknown[]}>= [];
  const client={query:async(sql:string,args:unknown[])=>{
    if(sql.includes('WITH RECURSIVE parent_chain'))return {rows:[],rowCount:0};
    if(sql.includes('count(*)::integer AS total'))return {rows:[{total:0}],rowCount:1};
    writes.push({sql,args});
    return {rows:[{id:'field'}],rowCount:1};
  }};
  const db={transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
  await new ObjectDefinitionService(db).addField('tenant','Invoice__c','AccountId','Master-Detail(Account__c)',
    undefined,'Account',{
      relationship:{
        type:'Master-Detail',targetObject:'Account__c',relationshipName:'Account',
        childRelationshipName:'Invoices',allowReparenting:true
      }
    });

  const insert=writes.find(call=>call.sql.includes('INSERT INTO md_field_definitions'));
  assert.ok(insert);
  assert.deepEqual(insert.args.slice(26),['Account','Invoices','Cascade',true]);
});

test('Master-Detail definitions reject cycles and a third master relationship',async()=>{
  const dbFor=(cycle:boolean,masters:number)=>{
    const client={query:async(sql:string)=>{
      if(sql.includes('WITH RECURSIVE parent_chain'))return {rows:cycle?[{exists:1}]:[],rowCount:cycle?1:0};
      if(sql.includes('count(*)::integer AS total'))return {rows:[{total:masters}],rowCount:1};
      throw new Error('Unexpected query '+sql);
    }};
    return {transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
  };
  await assert.rejects(()=>new ObjectDefinitionService(dbFor(true,0)).addField(
    'tenant','Parent__c','ChildId','Master-Detail(Child__c)'),/cannot create a cycle/);
  await assert.rejects(()=>new ObjectDefinitionService(dbFor(false,2)).addField(
    'tenant','Child__c','ThirdParentId','Master-Detail(ThirdParent__c)'),/more than two/);
});

test('lookup deletion behavior restricts or clears referencing fields',async()=>{
  const deletes:string[]=[];
  const history:Array<unknown[]>= [];
  const makeRecords=(behavior:'Restrict'|'Clear',required=false)=>{
    const client={query:async(sql:string,args:unknown[])=>{
      if(sql.includes('md_record_access'))return {rows:[{id:'parent'}],rowCount:1};
      if(sql.includes('SELECT r.id AS record_id'))return {rows:[{
        record_id:'child',object_api:'Child__c',field_api:'ParentId',
        relationship_type:'Lookup',delete_behavior:behavior,required
      }],rowCount:1};
      if(sql.includes('UPDATE md_record_values SET value_text=NULL'))
        return {rows:[{record_id:'child',object_api:'Child__c',field_api:'ParentId'}],rowCount:1};
      if(sql.includes('INSERT INTO md_record_history'))history.push(args);
      if(sql.startsWith('DELETE FROM md_records'))deletes.push(String(args[2]));
      return {rows:[],rowCount:1};
    }};
    const db={transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
    const rbac={require:async()=>{}} as unknown as RbacEngine;
    return new RecordEngine(db,rbac);
  };
  await assert.rejects(()=>makeRecords('Restrict').remove('tenant','user','Parent__c','parent'),
    /restricted by a lookup/);
  assert.deepEqual(deletes,[]);
  await makeRecords('Clear').remove('tenant','user','Parent__c','parent');
  assert.deepEqual(deletes,['parent']);
  assert.equal(history.length,1);
  assert.equal(history[0][5],'parent');
  await assert.rejects(()=>makeRecords('Clear',true).remove('tenant','user','Parent__c','parent'),
    /restricted by a lookup/);
  assert.deepEqual(deletes,['parent']);
});

test('deleting a master record cascades through detail records',async()=>{
  const deleted:string[]=[];
  const client={query:async(sql:string,args:unknown[])=>{
    if(sql.includes('md_record_access'))return {rows:[{id:'parent'}],rowCount:1};
    if(sql.includes('SELECT id FROM md_records'))return {rows:[{id:String(args[2])}],rowCount:1};
    if(sql.includes('SELECT r.id AS record_id'))return args[1]==='parent'
      ?{rows:[{record_id:'child',object_api:'Child__c',field_api:'ParentId',
        relationship_type:'Master-Detail',delete_behavior:'Cascade'}],rowCount:1}
      :{rows:[],rowCount:0};
    if(sql.startsWith('DELETE FROM md_records'))deleted.push(String(args[2]));
    return {rows:[],rowCount:1};
  }};
  const db={transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  await new RecordEngine(db,rbac).remove('tenant','user','Parent__c','parent');
  assert.deepEqual(deleted,['child','parent']);
});

test('master-detail updates cannot reparent a child unless enabled',async()=>{
  const db={query:async(sql:string)=>{
    if(sql.includes('FROM md_field_definitions'))return {rows:[{
      api_name:'ParentId',data_type:'reference',related_object:'Parent__c',relationship_type:'Master-Detail',
      allow_reparenting:false,required:true,max_length:null,precision:null,scale:null,is_unique:false,
      external_id:false,case_sensitive:false,default_value:null,auto_number_format:null
    }],rowCount:1};
    if(sql.includes('SELECT reference_record_id FROM md_record_values'))
      return {rows:[{reference_record_id:'00000000-0000-4000-8000-000000000001'}],rowCount:1};
    throw new Error('Unexpected query '+sql);
  }} as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  await assert.rejects(()=>new RecordEngine(db,rbac).update('tenant','user','Child__c','00000000-0000-4000-8000-000000000003',{
    ParentId:'00000000-0000-4000-8000-000000000002'
  }),/does not allow reparenting/);
});

test('roll-up summaries require a Master-Detail child field and persist configuration',async()=>{
  const writes:Array<{sql:string;args:unknown[]}>=[];
  const client={query:async(sql:string,args:unknown[])=>{
    if(sql.includes('SELECT data_type,related_object,relationship_type'))
      return {rows:[{data_type:'reference',related_object:'Account__c',relationship_type:'Master-Detail'}],rowCount:1};
    if(sql.includes('SELECT data_type FROM md_field_definitions'))
      return {rows:[{data_type:'currency'}],rowCount:1};
    writes.push({sql,args});
    return {rows:[{id:'field'}],rowCount:1};
  }};
  const db={transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
  await new ObjectDefinitionService(db).addField('tenant','Account__c','Total__c','Roll-Up Summary',
    undefined,'Total',{
      rollup:{childObject:'Invoice__c',relationshipField:'AccountId',operation:'SUM',sourceField:'Amount'}
    });
  const insert=writes.find(item=>item.sql.includes('INSERT INTO md_field_definitions'));
  assert.ok(insert);
  assert.deepEqual(insert.args.slice(21,25),['Invoice__c','AccountId','SUM','Amount']);
  await assert.rejects(()=>new ObjectDefinitionService(db).addField(
    'tenant','Account__c','RequiredTotal__c','Roll-Up Summary',undefined,'Required Total',{
      required:true,
      rollup:{childObject:'Invoice__c',relationshipField:'AccountId',operation:'COUNT'}
    }),/cannot be required, unique, external IDs or have defaults/);

  const invalidClient={query:async(sql:string)=>{
    if(sql.includes('SELECT data_type,related_object,relationship_type'))
      return {rows:[{data_type:'reference',related_object:'Account__c',relationship_type:'Lookup'}],rowCount:1};
    throw new Error('Unexpected query '+sql);
  }};
  const invalidDb={transaction:async(run:(c:typeof invalidClient)=>Promise<unknown>)=>run(invalidClient)} as unknown as SqlPersistence;
  await assert.rejects(()=>new ObjectDefinitionService(invalidDb).addField(
    'tenant','Account__c','Total__c','Roll-Up Summary',undefined,'Total',{
      rollup:{childObject:'Invoice__c',relationshipField:'AccountId',operation:'COUNT'}
    }),/requires an active Master-Detail field/);
});

test('roll-up MIN/MAX accept temporal source fields while SUM rejects them',async()=>{
  for(const sourceType of ['date','datetime'] as const){
    const client={query:async(sql:string)=>{
      if(sql.includes('SELECT data_type,related_object,relationship_type'))
        return {rows:[{data_type:'reference',related_object:'Account__c',relationship_type:'Master-Detail'}],rowCount:1};
      if(sql.includes('SELECT data_type FROM md_field_definitions'))
        return {rows:[{data_type:sourceType}],rowCount:1};
      return {rows:[{id:'field'}],rowCount:1};
    }};
    const db={transaction:async(run:(value:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
    for(const operation of ['MIN','MAX'] as const)
      await new ObjectDefinitionService(db).addField('tenant','Account__c','Earliest__c','Roll-Up Summary',
        undefined,'Earliest', {rollup:{childObject:'Event__c',relationshipField:'AccountId',
          operation,sourceField:'OccurredAt'}});
    await assert.rejects(()=>new ObjectDefinitionService(db).addField(
      'tenant','Account__c','Total__c','Roll-Up Summary',undefined,'Total',
      {rollup:{childObject:'Event__c',relationshipField:'AccountId',
        operation:'SUM',sourceField:'OccurredAt'}}),/SUM roll-ups require a numeric source field/);
  }
});

test('roll-up recalculation uses aligned SQL parameters for COUNT and numeric aggregates',async()=>{
  for(const operation of ['COUNT','SUM'] as const){
    const aggregateCalls:Array<{sql:string;args:unknown[]}>=[];
    const client={query:async(sql:string,args:unknown[]=[])=>{
      if(sql.includes('SELECT object_api AS parent_object,api_name AS field_api'))return {
        rows:args[1]==='Invoice__c'?[{
          parent_object:'Account__c',field_api:'Total__c',relationship_field:'AccountId',
          operation,source_field:operation==='COUNT'?null:'Amount'
        }]:[],rowCount:args[1]==='Invoice__c'?1:0
      };
      if(sql.includes('FROM md_records c')){
        aggregateCalls.push({sql,args});
        return {rows:[{value:'2'}],rowCount:1};
      }
      return {rows:[],rowCount:1};
    }};
    const db={query:client.query} as unknown as SqlPersistence;
    const rbac={} as RbacEngine;
    const engine=new RecordEngine(db,rbac) as unknown as {
      refreshRollups:(client:typeof client,tenantId:string,childObject:string,parentIds:Map<string,Set<string>>)=>Promise<void>
    };
    await engine.refreshRollups(client,'tenant','Invoice__c',new Map([['Account__c',new Set(['parent-id'])]]));
    assert.equal(aggregateCalls.length,1);
    assert.equal(aggregateCalls[0].args.at(-1),'parent-id');
    assert.equal(aggregateCalls[0].args.length,5);
    assert.match(aggregateCalls[0].sql,/reference_record_id=\$5/);
    if(operation==='SUM')assert.match(aggregateCalls[0].sql,/\\\./);
  }
});

test('date and date-time MIN/MAX roll-ups aggregate and persist typed projections',async()=>{
  for(const sourceType of ['date','datetime'] as const){
    for(const operation of ['MIN','MAX'] as const){
      const aggregateCalls:Array<{sql:string;args:unknown[]}>= [];
      const value=sourceType==='date'?'2026-05-03':'2026-05-03T10:15:00.000Z';
      const client={query:async(sql:string,args:unknown[]=[])=>{
        if(sql.includes('SELECT object_api AS parent_object,api_name AS field_api'))return {
          rows:[{parent_object:'Account__c',field_api:'Earliest__c',relationship_field:'AccountId',
            operation,source_field:'OccurredAt',source_data_type:sourceType,filter_logic:'All'}],rowCount:1
        };
        if(sql.includes('FROM md_records c')){
          aggregateCalls.push({sql,args});
          return {rows:[{value}],rowCount:1};
        }
        if(sql.includes('INSERT INTO md_record_values')){
          aggregateCalls.push({sql,args});
          return {rows:[],rowCount:1};
        }
        return {rows:[],rowCount:1};
      }};
      const db={query:client.query} as unknown as SqlPersistence;
      const engine=new RecordEngine(db,{} as RbacEngine) as unknown as {
        refreshRollups:(client:typeof client,tenantId:string,childObject:string,
          parentIds:Map<string,Set<string>>)=>Promise<void>
      };
      await engine.refreshRollups(client,'tenant','Event__c',
        new Map([['Account__c',new Set(['parent-id'])]]));
      const aggregate=aggregateCalls.find(call=>call.sql.includes('FROM md_records c'));
      const write=aggregateCalls.find(call=>call.sql.includes('INSERT INTO md_record_values'));
      assert.ok(aggregate);
      assert.ok(write);
      const operationPattern=operation==='MIN'?/min\(/i:/max\(/i;
      const sourcePattern=sourceType==='date'?/sv\.value_date\)/:/sv\.value_datetime\)/;
      assert.match(aggregate.sql,operationPattern);
      assert.match(aggregate.sql,sourcePattern);
      assert.equal(write.args[4],value);
      assert.equal(write.args[5],null);
      assert.equal(write.args[sourceType==='date'?6:7],value);
      assert.equal(write.args[sourceType==='date'?7:6],null);
    }
  }
});

test('roll-up filter metadata is validated, persisted and applied with parameterized criteria',async()=>{
  const writes:Array<{sql:string;args:unknown[]}>= [];
  const metadataClient={query:async(sql:string,args:unknown[]=[])=>{
    if(sql.includes('SELECT data_type,related_object,relationship_type'))
      return {rows:[{data_type:'reference',related_object:'Account__c',relationship_type:'Master-Detail'}],rowCount:1};
    if(sql.includes('SELECT api_name,data_type FROM md_field_definitions'))
      return {rows:[{api_name:'Status',data_type:'picklist'}],rowCount:1};
    writes.push({sql,args});
    return {rows:[{id:'field'}],rowCount:1};
  }};
  const metadataDb={transaction:async(run:(client:typeof metadataClient)=>Promise<unknown>)=>run(metadataClient)} as unknown as SqlPersistence;
  await new ObjectDefinitionService(metadataDb).addField('tenant','Account__c','OpenCount__c','Roll-Up Summary',
    undefined,'Open Count',{
      rollup:{childObject:'Invoice__c',relationshipField:'AccountId',operation:'COUNT',
        filterLogic:'Any',filters:[
          {fieldApiName:'Status',operator:'Equals',value:'Open'},
          {fieldApiName:'Status',operator:'Is Null'}
        ]}
    });
  const definition=writes.find(item=>item.sql.includes('INSERT INTO md_field_definitions'));
  assert.equal(definition?.args[25],'Any');
  const storedFilters=writes.filter(item=>item.sql.includes('INSERT INTO md_field_rollup_filters'));
  assert.equal(storedFilters.length,2);
  assert.deepEqual(storedFilters[0].args,
    ['tenant','Account__c','Invoice__c','OpenCount__c','Status','Equals','Open',0]);

  let aggregateSql='';
  let aggregateArgs:unknown[]=[];
  const client={query:async(sql:string,args:unknown[]=[])=>{
    if(sql.includes('SELECT object_api AS parent_object,api_name AS field_api'))return {
      rows:[{parent_object:'Account__c',field_api:'OpenCount__c',relationship_field:'AccountId',
        operation:'COUNT',source_field:null,filter_logic:'Any'}],rowCount:1
    };
    if(sql.includes('FROM md_field_rollup_filters'))return {
      rows:[
        {field_api:'Status',operator:'Equals',value_text:'Open',data_type:'picklist'},
        {field_api:'Status',operator:'Is Null',value_text:'',data_type:'picklist'}
      ],rowCount:2
    };
    if(sql.includes('FROM md_records c')){aggregateSql=sql;aggregateArgs=args;return {rows:[{value:'3'}],rowCount:1};}
    return {rows:[],rowCount:1};
  }};
  const engine=new RecordEngine({query:client.query} as unknown as SqlPersistence,{} as RbacEngine) as unknown as {
    refreshRollups:(client:typeof client,tenantId:string,childObject:string,parentIds:Map<string,Set<string>>)=>Promise<void>
  };
  await engine.refreshRollups(client,'tenant','Invoice__c',new Map([['Account__c',new Set(['parent-id'])]]));
  assert.match(aggregateSql,/OR/);
  assert.deepEqual(aggregateArgs.slice(5),['Status','Open','Status']);
});

test('Auto Number fields accept year tokens and are required and unique',async()=>{
  const writes:Array<{sql:string;args:unknown[]}>= [];
  const client={query:async(sql:string,args:unknown[]=[])=>{
    writes.push({sql,args});
    return {rows:[{id:'field'}],rowCount:1};
  }};
  const db={transaction:async(run:(client:typeof client)=>Promise<unknown>)=>run(client)} as unknown as SqlPersistence;
  await new ObjectDefinitionService(db).addField('tenant','Invoice__c','InvoiceNumber','Auto Number',
    undefined,'Invoice Number',{autoNumberFormat:'INV-{YYYY}'});
  const insert=writes.find(item=>item.sql.includes('INSERT INTO md_field_definitions'));
  assert.equal(insert?.args[8],true);
  assert.equal(insert?.args[10],true);
  assert.equal(insert?.args[20],'INV-{YYYY}');
  await assert.rejects(()=>new ObjectDefinitionService(db).addField(
    'tenant','Invoice__c','InvalidNumber','Auto Number',undefined,'Invalid Number',
    {autoNumberFormat:'INV-'}),/Invalid auto-number format/);
});

test('Time fields normalize values and Rich Text fields sanitize stored HTML',async()=>{
  const metadataWrites:Array<{sql:string;args:unknown[]}>= [];
  const metadataClient={query:async(sql:string,args:unknown[])=>{
    metadataWrites.push({sql,args});return {rows:[{id:'field'}],rowCount:1};
  }};
  const metadataDb={transaction:async(run:(c:typeof metadataClient)=>Promise<unknown>)=>run(metadataClient)} as unknown as SqlPersistence;
  const definitionsService=new ObjectDefinitionService(metadataDb);
  await definitionsService.addField('tenant','Note__c','ReminderAt','Time');
  await definitionsService.addField('tenant','Note__c','Summary','Rich Text Area');
  const definitionInserts=metadataWrites.filter(item=>item.sql.includes('INSERT INTO md_field_definitions'));
  assert.equal(definitionInserts[0].args[3],'time');
  assert.equal(definitionInserts[1].args[3],'richtext');
  assert.equal(definitionInserts[1].args[5],131072);
  await assert.rejects(()=>definitionsService.addField('tenant','Note__c','Unsafe','Rich Text Area',
    undefined,undefined,{unique:true}),/cannot be unique or external IDs/);

  const writes:Array<{field:string;value:string|null}>= [];
  const definitions=[
    {api_name:'ReminderAt',data_type:'time',related_object:null,relationship_type:null,allow_reparenting:false,
      required:false,max_length:null,precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,
      default_value:null,auto_number_format:null},
    {api_name:'Summary',data_type:'richtext',related_object:null,relationship_type:null,allow_reparenting:false,
      required:false,max_length:131072,precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,
      default_value:null,auto_number_format:null}
  ];
  const client={query:async(sql:string,args:unknown[])=>{
    if(sql.includes('pg_advisory_xact_lock_shared'))return {rows:[],rowCount:1};
    if(sql.includes('FROM md_field_definitions LEFT JOIN'))return {rows:definitions,rowCount:definitions.length};
    if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO md_records'))return {rows:[{id:'created'}],rowCount:1};
    if(sql.includes("data_type='autonumber'"))return {rows:[],rowCount:0};
    if(sql.includes("data_type='rollup'"))return {rows:[],rowCount:0};
    if(sql.includes('rollup_relationship_field AS relationship_field'))return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO md_record_values')){
      writes.push({field:String(args[3]),value:args[4] as string|null});
      return {rows:[],rowCount:1};
    }
    throw new Error('Unexpected transactional query '+sql);
  }};
  const db={
    query:async(sql:string)=>{
      if(sql.includes('FROM md_field_definitions'))return {rows:definitions,rowCount:definitions.length};
      if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
      throw new Error('Unexpected query '+sql);
    },
    transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)
  } as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const records=new RecordEngine(db,rbac);
  await records.create('tenant','user','Note__c',{
    ReminderAt:'09:30',Summary:'<script>alert(1)</script><b>safe</b><img src=x onerror="alert(1)">'
  });
  assert.equal(writes.find(item=>item.field==='ReminderAt')?.value,'09:30:00.000');
  const html=writes.find(item=>item.field==='Summary')?.value??'';
  assert.ok(html.includes('<b>safe</b>'));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('onerror'));
  await assert.rejects(()=>records.create('tenant','user','Note__c',{ReminderAt:'25:00'}),/Invalid time field/);
});

test('multi-select list filters implement INCLUDES and EXCLUDES with validated values',async()=>{
  const calls:Array<{sql:string;args:unknown[]}>= [];
  const db={query:async(sql:string,args:unknown[])=>{
    calls.push({sql,args});
    if(sql.includes('FROM md_field_definitions'))return {rows:[{
      api_name:'Tags',data_type:'multipicklist',related_object:null,relationship_type:null,
      allow_reparenting:false,required:false,max_length:null,precision:null,scale:null,is_unique:false,
      external_id:false,case_sensitive:false,default_value:null,auto_number_format:null
    }],rowCount:1};
    if(sql.includes('FROM md_field_picklist_values'))return {rows:[{value:'Urgent'},{value:'Review'}],rowCount:2};
    if(sql.includes('count(*)::text'))return {rows:[{total:'0'}],rowCount:1};
    if(sql.includes('WITH selected AS'))return {rows:[],rowCount:0};
    throw new Error('Unexpected query '+sql);
  }} as unknown as SqlPersistence;
  const rbac={require:async()=>{},allowed:async()=>true,allowedMany:async()=>[true]} as unknown as RbacEngine;
  const records=new RecordEngine(db,rbac);
  await records.list('tenant','user','Case__c',10,0,{
    filterField:'Tags',filterValue:'Urgent;Review',filterOperator:'Includes'
  });
  const include=calls.find(call=>call.sql.includes('count(*)::text'));
  assert.ok(include?.sql.includes('FROM md_record_multi_values mv'));
  assert.ok(include?.args.some(value=>Array.isArray(value)&&value.join(';')==='Urgent;Review'));
  calls.length=0;
  await records.list('tenant','user','Case__c',10,0,{
    filterField:'Tags',filterValue:'Urgent',filterOperator:'Excludes'
  });
  const exclude=calls.find(call=>call.sql.includes('count(*)::text'));
  assert.ok(exclude?.sql.includes('NOT (COALESCE('));
  await assert.rejects(()=>records.list('tenant','user','Case__c',10,0,{
    filterField:'Tags',filterValue:'Urgent;;Review',filterOperator:'Includes'
  }),/Invalid multi-select list filter/);
});

test('multi-select picklist record writes maintain normalized child values',async()=>{
  const values:Array<{sql:string;args:unknown[]}>= [];
  const definition={api_name:'Tags',data_type:'multipicklist',related_object:null,relationship_type:null,
    allow_reparenting:false,required:false,max_length:null,precision:null,scale:null,is_unique:false,
    external_id:false,case_sensitive:false,default_value:null,auto_number_format:null,picklist_restricted:false};
  const client={query:async(sql:string,args:unknown[])=>{
    if(sql.includes('pg_advisory_xact_lock_shared'))return {rows:[],rowCount:1};
    if(sql.includes('FROM md_field_definitions LEFT JOIN'))return {rows:[definition],rowCount:1};
    if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
    if(sql.includes('FROM md_field_picklist_values'))return {rows:[{value:'Urgent'},{value:'Review'}],rowCount:2};
    if(sql.includes('INSERT INTO md_records'))return {rows:[{id:'created'}],rowCount:1};
    if(sql.includes("data_type='autonumber'"))return {rows:[],rowCount:0};
    values.push({sql,args});return {rows:[],rowCount:1};
  }};
  const db={
    query:async(sql:string)=>{
      if(sql.includes('FROM md_field_definitions'))return {rows:[definition],rowCount:1};
      if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
      throw new Error('Unexpected query '+sql);
    },
    transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)
  } as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  await new RecordEngine(db,rbac).create('tenant','user','Case__c',{Tags:'Urgent;Review'});
  const children=values.filter(call=>call.sql.includes('INSERT INTO md_record_multi_values'));
  assert.deepEqual(children.map(call=>call.args.slice(4)),[['Urgent',0],['Review',1]]);
});

test('Address fields validate and persist components as SQL columns',async()=>{
  const writes:Array<{sql:string;args:unknown[]}>= [];
  const definition={api_name:'BillingAddress',data_type:'address',related_object:null,relationship_type:null,
    allow_reparenting:false,required:false,max_length:null,precision:null,scale:null,is_unique:false,
    external_id:false,case_sensitive:false,default_value:null,auto_number_format:null};
  const client={query:async(sql:string,args:unknown[])=>{
    if(sql.includes('pg_advisory_xact_lock_shared'))return {rows:[],rowCount:1};
    if(sql.includes('FROM md_field_definitions LEFT JOIN'))return {rows:[definition],rowCount:1};
    if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
    if(sql.includes('INSERT INTO md_records'))return {rows:[{id:'created'}],rowCount:1};
    if(sql.includes("data_type='autonumber'"))return {rows:[],rowCount:0};
    writes.push({sql,args});return {rows:[],rowCount:1};
  }};
  const db={
    query:async(sql:string)=>{
      if(sql.includes('FROM md_field_definitions'))return {rows:[definition],rowCount:1};
      if(sql.includes('FROM md_object_record_types'))return {rows:[],rowCount:0};
      throw new Error('Unexpected query '+sql);
    },
    transaction:async(run:(c:typeof client)=>Promise<unknown>)=>run(client)
  } as unknown as SqlPersistence;
  const rbac={require:async()=>{}} as unknown as RbacEngine;
  const records=new RecordEngine(db,rbac);
  await records.create('tenant','user','Account__c',{
    BillingAddress:{street:'1 Main St',city:'Seattle',state:'WA',postalCode:'98101',country:'US'}
  });
  const insert=writes.find(call=>call.sql.includes('INSERT INTO md_record_values'));
  assert.ok(insert?.sql.includes('address_street'));
  assert.deepEqual(insert?.args.slice(10,15),['1 Main St','Seattle','WA','98101','US']);
  assert.deepEqual(insert?.args.slice(15),[null,null,null,null]);
  await assert.rejects(()=>records.create('tenant','user','Account__c',{
    BillingAddress:{street:'x'.repeat(256)}
  }),/Invalid address component: street/);
  await assert.rejects(()=>records.create('tenant','user','Account__c',{
    BillingAddress:{street:'Valid',unexpected:'value'}
  }),/Invalid address component/);
});

test('formula fields calculate on read and honor field-level access',async()=>{
  const definitions=[
    {api_name:'Amount',data_type:'number',related_object:null,relationship_type:null,allow_reparenting:false,
      required:false,max_length:null,precision:8,scale:2,is_unique:false,external_id:false,case_sensitive:false,
      default_value:null,auto_number_format:null,formula_expression:null,formula_return_type:null},
    {api_name:'DoubleAmount',data_type:'formula',related_object:null,relationship_type:null,allow_reparenting:false,
      required:false,max_length:null,precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,
      default_value:null,auto_number_format:null,formula_expression:'@Invoice__c.Amount * 2',formula_return_type:'Number'},
    {api_name:'LoggedAt',data_type:'formula',related_object:null,relationship_type:null,allow_reparenting:false,
      required:false,max_length:null,precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,
      default_value:null,auto_number_format:null,formula_expression:'DATETIMEVALUE("2026-01-02T03:04:05Z")',formula_return_type:'DateTime'},
    {api_name:'Clock',data_type:'formula',related_object:null,relationship_type:null,allow_reparenting:false,
      required:false,max_length:null,precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,
      default_value:null,auto_number_format:null,formula_expression:'TIMEVALUE("12:34:56")',formula_return_type:'Time'},
    {api_name:'CloneFlag',data_type:'formula',related_object:null,relationship_type:null,allow_reparenting:false,
      required:false,max_length:null,precision:null,scale:null,is_unique:false,external_id:false,case_sensitive:false,
      default_value:null,auto_number_format:null,formula_expression:'ISCLONE()',formula_return_type:'Checkbox'}
  ];
  const db={query:async(sql:string)=>{
    if(sql.startsWith('SELECT api_name,data_type'))return {rows:definitions,rowCount:definitions.length};
    if(sql.includes('FROM md_users u'))return {rows:[{
      time_zone:'UTC',has_currency_settings:false,currency_iso_code:null,conversion_rate:null
    }],rowCount:1};
    if(sql.includes('FROM md_records r'))return {rows:[{
      id:'record',created_at:new Date('2026-01-01T00:00:00Z'),updated_at:new Date('2026-01-02T00:00:00Z'),
      owner_id:null,record_type_id:null,is_clone:true,field_api:'Amount',value_text:'12.50',reference_record_id:null,
      data_type:'number',geo_latitude:null,geo_longitude:null,address_street:null,address_city:null,
      address_state:null,address_postal_code:null,address_country:null
    }],rowCount:1};
    throw new Error('Unexpected query '+sql);
  }} as unknown as SqlPersistence;
  const rbac={require:async()=>{},allowed:async()=>true,allowedMany:async()=>[true]} as unknown as RbacEngine;
  const record=await new RecordEngine(db,rbac).get('tenant','user','Invoice__c','00000000-0000-4000-8000-000000000001');
  assert.equal(record.DoubleAmount,25);
  assert.equal(record.LoggedAt,'2026-01-02T03:04:05.000Z');
  assert.equal(record.Clock,'12:34:56.000');
  assert.equal(record.CloneFlag,true);
});
