import test from 'node:test';
import assert from 'node:assert/strict';
import {projectRecordChoices,toggleChoiceSelection}
  from '../src/one/shared/recordChoices.mjs';

test('Record-bound choices use safe metadata field mappings and preserve option identity',()=>{
  const records=[
    {Id:'item-1',Name:'Side A',Upcharge:1.5},
    {Id:'item-2',Name:'Side B',Upcharge:0},
    {Id:'item-1',Name:'Duplicate',Upcharge:6}
  ];
  assert.deepEqual(projectRecordChoices(records,'Name','Id','Upcharge'),[
    {value:'item-1',label:'Side A',price:1.5},
    {value:'item-2',label:'Side B',price:0}
  ]);
  assert.deepEqual(projectRecordChoices(records,'Bad.Field','Id'),[]);
  assert.deepEqual(projectRecordChoices(records,'Name','__proto__'),[]);
  assert.deepEqual(projectRecordChoices(Array.from({length:201},()=>({Id:'1',Name:'x'})),'Name','Id'),[]);
});
test('Record-backed choices project safe product images when configured',()=>{
  const records=[
    {Id:'side-1',Name:'Fries',ImageUrl:'asset:01234567-89ab-4cde-8fab-0123456789ab'},
    {Id:'side-2',Name:'Corn',ImageUrl:'javascript:alert(1)'}
  ];
  assert.deepEqual(projectRecordChoices(records,'Name','Id','','ImageUrl'),[
    {value:'side-1',label:'Fries',image:'asset:01234567-89ab-4cde-8fab-0123456789ab'},
    {value:'side-2',label:'Corn'}
  ]);
  assert.deepEqual(projectRecordChoices(records,'Name','Id','','Bad.Field'),[]);
});
test('Record-backed multi-select enforces maximum and permits deselection',()=>{
  assert.deepEqual(toggleChoiceSelection(['a'],'b',2),{values:['a','b'],limited:false});
  assert.deepEqual(toggleChoiceSelection(['a','b'],'c',2),{values:['a','b'],limited:true});
  assert.deepEqual(toggleChoiceSelection(['a','b'],'a',2),{values:['b'],limited:false});
  assert.deepEqual(toggleChoiceSelection(['a','b'],'c',0),{values:['a','b','c'],limited:false});
});
