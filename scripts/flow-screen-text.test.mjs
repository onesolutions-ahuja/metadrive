import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveScreenText} from '../apps/web/src/flowScreenRuntimeUtils.ts';

test('Screen Flow text binds scalar resource values without interpreting markup', () => {
  assert.equal(resolveScreenText('Challenge {!Threshold}; minimum {!Age}', {Threshold: 25, Age: 21}),
    'Challenge 25; minimum 21');
  assert.equal(resolveScreenText('{!Customer.Name}', {Customer: {Name: '<img onerror=alert(1)>'}}),
    '<img onerror=alert(1)>');
  assert.equal(resolveScreenText('{!Approved} / {!Count}', {Approved: false, Count: 0}), 'false / 0');
});

test('resource text omits missing or non-scalar values and refuses prototype traversal', () => {
  const values = {Customer: Object.create({Name: 'inherited'}), Secret: {value: 'hidden'}};
  assert.equal(resolveScreenText('{!Customer.Name}|{!Secret}|{!Missing}|{!constructor.name}', values), '|||');
  assert.equal(resolveScreenText(null, values), '');
  assert.equal(resolveScreenText('{!Customer.__proto__.Name}', values), '');
});
