import test from 'node:test';
import assert from 'node:assert/strict';
import {replacementDefinitions,replacementKinds,replacementDefinition} from '../apps/server/src/modules/metadata/phase2-replacement-definitions.mjs';
test('all 39 replacements are distinct, metadata-configured and draft',()=>{
 const defs=replacementDefinitions();
 assert.equal(defs.length,39);
 assert.equal(new Set(defs.map(d=>d.apiName)).size,39);
 defs.forEach((d,i)=>{
  assert.equal(d.recovery.legacyPosition,i);
  assert.equal(d.recovery.publishRequiresReferenceReconciliation,true);
  assert.equal(d.trustedBundled,false);
  assert.equal(d.status,'Draft');
  assert.ok(d.propertyDefinitions.length>=3);
  assert.deepEqual(d.surfaces,['page','dashboard','flow']);
 });
});
test('replacements cannot be mismatched to numeric slots',()=>{
 assert.throws(()=>replacementDefinition(replacementKinds[0],1));
});
