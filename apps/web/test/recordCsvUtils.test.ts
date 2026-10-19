import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseCsvImport} from '../src/core/records/RecordWorkspace/recordCsvUtils';
import type {ObjectMetadata} from '../src/core/metadata/Definitions/metadata';

const metadata={apiName:'Product',label:'Product',fields:[
 {apiName:'VAT_Applicable__c',label:'VAT applicability',dataType:'Boolean'},
 {apiName:'Price',label:'Price',dataType:'Number'},
 {apiName:'Name',label:'Name',dataType:'Text'}
]} as unknown as ObjectMetadata;
const id='11111111-1111-4111-8111-111111111111';

test('CSV Data Loader safely updates existing Product VAT values using typed booleans',()=>{
 const result=parseCsvImport('Id,VAT_Applicable__c,Price\n'+id+',true,2.50\n',metadata);
 assert.deepEqual(result,[{Id:id,VAT_Applicable__c:true,Price:2.5}]);
});
test('CSV Data Loader rejects ambiguous VAT classifications rather than coercing strings',()=>{
 assert.throws(()=>parseCsvImport('Id,VAT_Applicable__c\n'+id+',unknown\n',metadata),/true or false/);
});
test('CSV Data Loader rejects duplicate record IDs and invalid prices',()=>{
 assert.throws(()=>parseCsvImport('Id,VAT_Applicable__c\n'+id+',true\n'+id+',false\n',metadata),/duplicate record IDs/);
 assert.throws(()=>parseCsvImport('Name,Price\nTest,NaN\n',metadata),/finite number/);
});
test('CSV create imports preserve text and parse boolean false',()=>{
 assert.deepEqual(parseCsvImport('Name,VAT_Applicable__c\nTea,false\n',metadata),
  [{Name:'Tea',VAT_Applicable__c:false}]);
});
