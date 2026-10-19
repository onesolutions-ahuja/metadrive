import test from 'node:test';
import assert from 'node:assert/strict';
import {filterRelatedRecords} from '../src/core/pages/PageRuntime/filterRelatedRecords.mjs';

test('related record binding filters selected parent without leaking siblings',()=>{
 const rows=[{Id:'1',ChoiceGroup:'bucket-a'},{Id:'2',ChoiceGroup:'bucket-b'},
   {Id:'3',ChoiceGroup:{Id:'bucket-a'}}];
 assert.deepEqual(filterRelatedRecords(rows,'bucket-a','ChoiceGroup'),[rows[0],rows[2]]);
 assert.deepEqual(filterRelatedRecords(rows,'','ChoiceGroup'),[]);
 assert.deepEqual(filterRelatedRecords(rows,'bucket-b','invalid.Name'),[]);
 assert.deepEqual(filterRelatedRecords(rows,undefined,''),rows);
});
