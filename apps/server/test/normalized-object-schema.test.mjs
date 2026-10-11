import test from 'node:test';
import assert from 'node:assert/strict';
import {planNormalizedObjectTable,postgresFieldType,physicalObjectTable} from '../src/normalized-object-schema.mjs';
const oid='96120ef5-5b50-4905-bd71-09c85a200000';
const fid='96120ef5-5b50-4905-bd71-09c85a200001';
const valid={objectId:oid, fields:{Price__c:{fieldId:fid}}};
test('recognises live Salesforce-style field types and preserves SQL types',()=>{
  const mapping={
    'Text(255)':'VARCHAR(255)', 'Currency(16, 2)':'NUMERIC(16,2)',
    'Number(12, 0)':'NUMERIC(12,0)', 'Lookup(User)':'TEXT',
    'Date/Time':'TIMESTAMPTZ', 'Formula(Date)':'DATE',
    'Auto Number':'TEXT','Long Text Area':'TEXT','Checkbox':'BOOLEAN',
    'Picklist':'TEXT','URL':'TEXT'
  };
  for (const [type, expected] of Object.entries(mapping)) assert.equal(postgresFieldType(type),expected,type);
});
test('stable IDs preserve same SQL table and columns across object and field rename',()=>{
  const before=planNormalizedObjectTable({apiName:'Product__c',fields:[{apiName:'Price__c',dataType:'Currency(16, 2)'}]},valid);
  const after=planNormalizedObjectTable({apiName:'Catalog_Item__c',fields:[{apiName:'Selling_Price__c',dataType:'Currency(16, 2)'}]},{objectId:oid, fields:{Selling_Price__c:{fieldId:fid}}});
  assert.equal(before.table,after.table);
  assert.equal(before.columns[0].column,after.columns[0].column);
  assert.equal(before.columns[0].sqlType,'NUMERIC(16,2)');
  assert.equal(before.createTable,after.createTable);
});
test('rejects unsafely derived identifiers, missing registry IDs, unsupported types, invalid precision',()=>{
  assert.throws(()=>physicalObjectTable('Product__c'));
  assert.throws(()=>planNormalizedObjectTable({apiName:'Anything',fields:[{apiName:'Foo',dataType:'Text'}]}, {objectId:oid,fields:{}}));
  assert.throws(()=>postgresFieldType('XML'));
  assert.throws(()=>postgresFieldType('Currency(2, 8)'));
  assert.throws(()=>postgresFieldType('Text(9999999)'));
});
test('never interpolates object or field display names into SQL identifiers',()=>{
  const x=planNormalizedObjectTable({apiName:'Evil";DROP TABLE users;--',fields:[{apiName:'evil";DROP',dataType:'Text'}]},
   {objectId:oid,fields:{'evil";DROP':{fieldId:fid}}});
  const sql=[x.createTable,...x.addColumns].join(';');
  assert.ok(!sql.includes('DROP'));
  assert.ok(!sql.includes('Evil'));
  assert.ok(sql.includes('md_obj_'));
});
