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
test('Record-backed multi-select enforces maximum and permits deselection',()=>{
  assert.deepEqual(toggleChoiceSelection(['a'],'b',2),{values:['a','b'],limited:false});
  assert.deepEqual(toggleChoiceSelection(['a','b'],'c',2),{values:['a','b'],limited:true});
  assert.deepEqual(toggleChoiceSelection(['a','b'],'a',2),{values:['b'],limited:false});
  assert.deepEqual(toggleChoiceSelection(['a','b'],'c',0),{values:['a','b','c'],limited:false});
});
