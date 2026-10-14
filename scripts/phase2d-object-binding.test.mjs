import test from 'node:test';
import assert from 'node:assert/strict';
import {applyComponentObjectBinding} from '../apps/web/src/componentObjectBinding.ts';
const fields=[{apiName:'Name',label:'Name',dataType:'Text',picklistValues:[]},{apiName:'Score',label:'Score',dataType:'Number',picklistValues:[]}];
const rows=[{Name:'B',Score:20,Secret:'private'},{Name:'A',Score:10,Secret:'private'}];
test('2d uses existing filter contract and projects permitted fields',()=>{
 const binding={objectApiName:'Account',fieldApiNames:['Name'],filters:[{field:'Score',operator:'Greater Than',value:10}]};
 const result=applyComponentObjectBinding(rows,binding,'Account',fields);
 assert.deepEqual(result.errors,[]);
 assert.deepEqual(result.rows,[{Name:'B'}]);
});
test('2d denies unapproved fields, objects, invalid pagination and sort',()=>{
 const binding={objectApiName:'Account',fieldApiNames:['Secret']};
 assert.ok(applyComponentObjectBinding(rows,binding,'Account',fields).errors.length);
 assert.deepEqual(applyComponentObjectBinding(rows,{objectApiName:'Account',fieldApiNames:['Name']},'Contact',fields).rows,[]);
 assert.ok(applyComponentObjectBinding(rows,{objectApiName:'Account',fieldApiNames:['Name'],pagination:{limit:1000,offset:0}},'Account',fields).errors.length);
});
test('2d supports deterministic sort and pagination with no hidden fields',()=>{
 const binding={objectApiName:'Account',fieldApiNames:['Name'],sort:{fieldApiName:'Name',direction:'asc'},pagination:{limit:1,offset:0}};
 assert.deepEqual(applyComponentObjectBinding(rows,binding,'Account',fields).rows,[{Name:'A'}]);
});
