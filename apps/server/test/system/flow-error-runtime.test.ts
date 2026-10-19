import assert from 'node:assert/strict';
import test from 'node:test';
import {createFlowCustomError,FlowCustomError} from '../../src/system-files/flow-error-runtime.js';

test('Custom Error resolves text templates and preserves the selected field',()=>{
 const error=createFlowCustomError({
  errorMessage:'Cannot save {!$Record.Name}: {!Reason}',
  errorLocation:'Field',fieldName:'Status'
 },reference=>reference==='$Record.Name'?'Example':reference==='Reason'?'invalid state':null);
 assert(error instanceof FlowCustomError);
 assert.equal(error.message,'Cannot save Example: invalid state');
 assert.equal(error.fieldName,'Status');
});

test('Custom Error rejects empty, oversized, and non-scalar messages',()=>{
 assert.throws(()=>createFlowCustomError({errorMessage:'  '},()=>null),/message/);
 assert.throws(()=>createFlowCustomError({errorMessage:'x'.repeat(1001)},()=>null),/message/);
 assert.throws(()=>createFlowCustomError({errorMessage:'Invalid {!$Record}'},()=>({})),/non-scalar/);
});

test('Custom Error validates an optional field identifier',()=>{
 assert.throws(()=>createFlowCustomError({
  errorMessage:'Invalid',errorLocation:'Field',fieldName:'Bad.Field'
 },()=>null),/field is invalid/);
 assert.throws(()=>createFlowCustomError({
  errorMessage:'Invalid',errorLocation:'Field'
 },()=>null),/field is invalid/);
 assert.throws(()=>createFlowCustomError({
  errorMessage:'Invalid',errorLocation:'Unknown'
 },()=>null),/location must be Page or Field/);
});
