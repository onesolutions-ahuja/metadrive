import test from 'node:test';
import assert from 'node:assert/strict';
import {applySharedListMetadata,validateSharedListMetadata} from '../apps/web/src/sharedListMetadata.ts';
const fields=[{apiName:'Name',label:'Name',dataType:'Text'},{apiName:'Amount',label:'Amount',dataType:'Number'}];
const rows=[{Name:'B',Amount:20,Secret:'x'},{Name:'A',Amount:10,Secret:'y'}];
test('3d shares authorized list sorting, filtering and pagination',()=>{
 const config={columns:['Name'],sort:{field:'Amount',direction:'asc'},pageSize:1,page:0,filters:[{field:'Amount',operator:'Greater Than',value:5}]};
 assert.deepEqual(applySharedListMetadata(rows,config,fields),{rows:[{Name:'A'}],total:2,errors:[]});
});
test('3d fails closed for forbidden columns, filters and paging',()=>{
 assert.ok(validateSharedListMetadata({columns:['Secret']},fields).length);
 assert.ok(validateSharedListMetadata({columns:['Name'],filters:[{field:'Secret',operator:'Equals',value:'x'}]},fields).length);
 assert.deepEqual(applySharedListMetadata(rows,{columns:['Name'],pageSize:0},fields).rows,[]);
});
