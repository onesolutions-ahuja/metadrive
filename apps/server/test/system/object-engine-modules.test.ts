import test from 'node:test';
import assert from 'node:assert/strict';
import {createRecord,updateRecord,deleteRecord} from '../../src/object-engine/RecordLifecycleManager.js';
import {importRecordBatch} from '../../src/object-engine/RecordBulkProcessor.js';
import {listDeletedRecords,restoreDeletedRecord} from '../../src/object-engine/RecordRecoveryManager.js';
import {cascadeDeleteRecord} from '../../src/object-engine/CascadeDeleteHandler.js';
import {isSystemRecordField} from '../../src/object-engine/SystemFields.js';
import {registeredObject} from '../../src/object-engine/ObjectRegistry.js';
import {withRecordTransaction} from '../../src/object-engine/TransactionManager.js';
import {ExternalIdResolver} from '../../src/object-engine/ExternalIdResolver.js';
import {ExternalIdUpsert} from '../../src/system-files/external-id-upsert.js';

test('object module facets delegate all record writes to the same Record Engine',async()=>{
 const calls:Array<{method:string;args:unknown[]}>=[];const records=Object.fromEntries(
  ['create','update','remove','recycleBin','restore','importRecords'].map(method=>[method,async(...args:unknown[])=>{
    calls.push({method,args});return method;
  }])) as never;
 assert.equal(await createRecord(records,'t','u','Account',{Name:'A'}),'create');
 assert.equal(await updateRecord(records,'t','u','Account','id',{Name:'B'}),'update');
 assert.equal(await deleteRecord(records,'t','u','Account','id'),'remove');
 assert.equal(await cascadeDeleteRecord(records,'t','u','Account','id'),'remove');
 assert.equal(await listDeletedRecords(records,'t','u','Account'),'recycleBin');
 assert.equal(await restoreDeletedRecord(records,'t','u','Account','id'),'restore');
 assert.equal(await importRecordBatch(records,'t','u','Account',[{Name:'A'}]),'importRecords');
 assert.deepEqual(calls.map(x=>x.method),['create','update','remove','remove','recycleBin','restore','importRecords']);
 assert.deepEqual(calls[0].args,['t','u','Account',{Name:'A'}]);
});
test('external ID module reuses atomic SQL service',()=>assert.equal(ExternalIdResolver,ExternalIdUpsert));
test('record system field metadata uses reusable constants',()=>{
 assert.ok(isSystemRecordField('Id'));
 assert.ok(!isSystemRecordField('CustomName'));
});
test('object registry only reads metadata within the supplied tenant',async()=>{
 const calls:unknown[][]=[];const db={query:async(sql:string,args:unknown[])=>{
  assert.match(sql,/tenant_id=\$1/);calls.push(args);return {rows:[{api_name:'Account',label:'Account'}]};
 }};
 const found=await registeredObject(db as never,'tenant-a','Account');
 assert.equal(found?.api_name,'Account');
 assert.deepEqual(calls,[['tenant-a','Account']]);
});
test('transaction module delegates to the existing SQL transaction boundary',async()=>{
 let called=false;
 const db={transaction:async(fn:(client:unknown)=>Promise<unknown>)=>{called=true;return fn({id:'client'});}};
 assert.equal(await withRecordTransaction(db as never,async client=>(client as unknown as {id:string}).id),'client');
 assert.equal(called,true);
});
