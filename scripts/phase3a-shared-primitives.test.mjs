import test from 'node:test';
import assert from 'node:assert/strict';
import {sharedPrimitiveKinds,validatePrimitiveMetadata,primitiveAccessibilityProps} from '../apps/web/src/sharedPrimitiveMetadata.ts';
test('3a shares neutral primitives across components',()=>{
 assert.deepEqual(sharedPrimitiveKinds,['text','button','input','image','icon','divider']);
 assert.equal(validatePrimitiveMetadata({kind:'text',label:'Customer'}).valid,true);
});
test('3a enforces accessible names on controls and meaningful images',()=>{
 assert.equal(validatePrimitiveMetadata({kind:'button',actionEvent:'submit'}).valid,false);
 assert.equal(validatePrimitiveMetadata({kind:'input',label:'Search'}).valid,true);
 assert.equal(validatePrimitiveMetadata({kind:'image'}).valid,false);
 assert.deepEqual(primitiveAccessibilityProps({kind:'image',decorative:true}),{'aria-hidden':true});
});
test('3a rejects executable event strings and decorative interactions',()=>{
 assert.equal(validatePrimitiveMetadata({kind:'button',label:'Save',actionEvent:'javascript:evil'}).valid,false);
 assert.equal(validatePrimitiveMetadata({kind:'button',label:'Save',actionEvent:'save'}).valid,true);
 assert.equal(validatePrimitiveMetadata({kind:'icon',decorative:true,actionEvent:'click'}).valid,false);
});
