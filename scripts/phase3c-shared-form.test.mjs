import test from 'node:test';
import assert from 'node:assert/strict';
import {validateSharedFormControls,normalizeSharedFormValues} from '../apps/web/src/sharedFormControlMetadata.ts';
test('3c validates accessibility, duplicate property names and selects',()=>{
 assert.ok(validateSharedFormControls([{name:'Name',kind:'text',label:''}]).length);
 assert.ok(validateSharedFormControls([{name:'Name',kind:'text',label:'Name'},{name:'Name',kind:'text',label:'Name'}]).length);
 assert.deepEqual(validateSharedFormControls([{name:'Status',kind:'select',label:'Status',options:[{label:'Active',value:'Active'}]}]),[]);
});
test('3c preserves typed values without leaking unconfigured data',()=>{
 const fields=[{name:'Name',kind:'text',label:'Name',required:true},{name:'Enabled',kind:'checkbox',label:'Enabled'}];
 assert.deepEqual(normalizeSharedFormValues(fields,{Name:'Test',Enabled:false,Secret:'hidden'}),{values:{Name:'Test',Enabled:false},errors:[]});
 assert.ok(normalizeSharedFormValues(fields,{Enabled:'false'}).errors.length);
});
