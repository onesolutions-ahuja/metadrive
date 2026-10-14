import assert from 'node:assert/strict';
import {test} from 'node:test';
import {isFlowRecordObject,flowRecordWritableFields,validateFlowRecordFields} from '../src/flow-record-metadata.mjs';
import {prepareFlowCreateCollection} from '../src/flow-create-collection.mjs';
import {applyFlowCollectionAssignment} from '../src/flow-collection-assignment.mjs';
const object={apiName:'Product',fields:[{apiName:'Name'},{apiName:'Price'},{apiName:'Id'}]};
const definitions=[{name:'items',type:'Record Collection',dataType:'Product',isCollection:true}];
test('Flow writable fields are derived from object metadata, never immutable identifiers',()=>{
 const fields=flowRecordWritableFields(object);
 assert(fields.has('Name'));assert(fields.has('RecordTypeId'));
 assert(!fields.has('Id'));assert(!fields.has('CreatedDate'));
 assert(validateFlowRecordFields({Name:'Coffee',Price:5},object));
 assert(!validateFlowRecordFields({Id:'record'},object));
});
test('Flow create batch enforces metadata fields and preserves records',()=>{
 const items=[{Name:'Coffee',Price:5}];
 assert.deepEqual(prepareFlowCreateCollection(definitions,'items',object,items),items);
 assert.throws(()=>prepareFlowCreateCollection(definitions,'items',object,[{Id:'123'}]),/immutable field/);
 assert.throws(()=>prepareFlowCreateCollection(definitions,'items',object,[{Unknown:true}]),/immutable field/);
});
test('Record Collection assignment accepts only plain records',()=>{
 assert(isFlowRecordObject(new Date()));
 assert.equal(isFlowRecordObject(new Date(),true),false);
 assert.deepEqual(applyFlowCollectionAssignment([],[{Id:'A'}],'Add','Record Collection'),[{Id:'A'}]);
 assert.throws(()=>applyFlowCollectionAssignment([],[new Date()],'Add','Record Collection'),/invalid value/);
});
