import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {replacementDefinitions} from '../src/modules/metadata/phase2-replacement-definitions.mjs';

test('all recovered replacement modules render using the shared sandbox React contract', () => {
  const definitions = replacementDefinitions();
  assert.equal(definitions.length,39);
  for (const definition of definitions) {
    const module={exports:{}};
    const React={createElement:(tag,props,...children)=>({tag,props,children})};
    runInNewContext(definition.compiledJs,{module,React});
    assert.equal(typeof module.exports.default,'function',definition.apiName);
    const defaults=Object.fromEntries(definition.propertyDefinitions.map(p=>[p.propertyKey,p.defaultValue]));
    const rendered=module.exports.default(defaults);
    assert.equal(typeof rendered.tag,'string',definition.apiName);
    assert.ok(rendered.props['aria-label'],definition.apiName);
    assert.equal(definition.trustedBundled,false,definition.apiName);
    assert.equal(definition.status,'Draft',definition.apiName);
  }
});
test('public actions are not hardcoded into generic replacements',()=>{
  for (const definition of replacementDefinitions()) {
    assert.doesNotMatch(definition.compiledJs,/fetch\s*\(|XMLHttpRequest|window\.|localStorage/);
    assert.equal(definition.recovery.publishRequiresReferenceReconciliation,true);
  }
});
