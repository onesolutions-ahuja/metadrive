import test from 'node:test';
import assert from 'node:assert/strict';
import {validateComponentPropertyDefinitions,resolveComponentPropertyValues} from '../apps/web/src/componentProperties.ts';
test('2b typed defaults preserve saved legacy values and unknown keys',()=>{
 const definitions=[{name:'title',kind:'text',defaultValue:'Default'},{name:'count',kind:'number',min:0,defaultValue:1},{name:'enabled',kind:'boolean',defaultValue:false}];
 const saved={title:'Previously saved',legacyFlag:'keep'};
 const result=resolveComponentPropertyValues(definitions,saved);
 assert.deepEqual(result.errors,[]);
 assert.deepEqual(result.values,{title:'Previously saved',legacyFlag:'keep',count:1,enabled:false});
 assert.deepEqual(saved,{title:'Previously saved',legacyFlag:'keep'});
});
test('2b rejects duplicate reserved and invalid definitions',()=>{
 const errors=validateComponentPropertyDefinitions([{name:'title',kind:'text'},{name:'title',kind:'text'},{name:'constructor',kind:'text'},{name:'amount',kind:'number',min:10,max:2}]);
 assert.equal(errors.length,3);
});
test('2b validates required fields, text limits and numeric bounds',()=>{
 assert.ok(resolveComponentPropertyValues([{name:'title',kind:'text',required:true}],{}).errors.length);
 assert.ok(resolveComponentPropertyValues([{name:'title',kind:'text',maxLength:3}],{title:'long'}).errors.length);
 assert.ok(resolveComponentPropertyValues([{name:'count',kind:'number',min:0}],{count:-1}).errors.length);
 assert.ok(resolveComponentPropertyValues([{name:'count',kind:'number'}],{count:Infinity}).errors.length);
});
