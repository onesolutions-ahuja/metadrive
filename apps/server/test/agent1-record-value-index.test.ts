import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRuntimeValues } from '../src/modules/records/record-values.js';

test('agent1: indexed metadata normalization preserves number, boolean and text validation', () => {
  const object = { fields: [
    {apiName:'Amount',dataType:'Currency(10,2)'},
    {apiName:'Enabled',dataType:'Checkbox'},
    {apiName:'Label',dataType:'Text(8)'}
  ] };
  assert.deepEqual(normalizeRuntimeValues(object,{Amount:'12.25',Enabled:'false',Label:'Hello'}), {
    Amount:12.25,Enabled:false,Label:'Hello'
  });
  assert.throws(() => normalizeRuntimeValues(object,{Amount:'12.253'}),/scale/);
  assert.throws(() => normalizeRuntimeValues(object,{Label:'Too long for eight'}),/character limit/);
  assert.deepEqual(normalizeRuntimeValues(object,{External:'kept'}),{External:'kept'});
});
