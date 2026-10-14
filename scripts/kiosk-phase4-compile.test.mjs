import {test} from 'node:test';
import assert from 'node:assert/strict';
import {transformSync} from 'esbuild';
import {commerceComponents} from './kiosk-phase4-components.mjs';

test('every registered kiosk component compiles in the existing component compiler',()=>{
 for(const component of commerceComponents){
  assert.doesNotThrow(()=>transformSync(component.jsxSource,{
   loader:'jsx',format:'cjs',jsx:'transform',target:'es2020'
  }),component.apiName);
 }
});
