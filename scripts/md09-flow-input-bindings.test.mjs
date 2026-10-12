import test from 'node:test';
import assert from 'node:assert/strict';
import {
  declaredFlowInputs, decodeInputSource, encodeInputSource, mappedInputNames
} from '../apps/web/src/flowInputBindings.ts';

const resource = (name, dataType = 'Text', availableForInput = true) =>
  ({ name, label: 'Input ' + name, dataType, availableForInput, availableForOutput: false, isCollection: false, type: 'Variable' });

const flow = {
  apiName: 'Demo_Flow', label: 'Demo', flowType: 'Autolaunched Flow',
  status: 'Active', versionNumber: 3, activeVersion: 2,
  resources: [resource('WrongDraft')],
  versions: [
    { versionNumber: 2, resources: [resource('RecordId'), resource('Quantity', 'Number'), resource('PrivateValue', 'Text', false)] },
    { versionNumber: 3, resources: [resource('NewDraftOnly')] }
  ]
};
const fields = [{ apiName: 'Name' }, { apiName: 'Price__c' }];

test('active-version resources are authoritative, not unsaved draft inputs', () => {
  assert.deepEqual(declaredFlowInputs(flow).map(input => input.name), ['RecordId', 'Quantity']);
  assert.deepEqual(mappedInputNames(flow, { OldInput: '$session', Quantity: '$event.qty' }),
    ['RecordId', 'Quantity', 'OldInput']);
  assert.deepEqual(declaredFlowInputs(undefined), []);
});

test('existing event, session, record and literal mapping values round-trip unchanged', () => {
  for (const value of ['$session', '$event', '$event.item.id', '$record.Price__c', 'hello', '3', 3, true, false, '']) {
    const decoded = decodeInputSource(value);
    assert.notEqual(decoded.kind, 'Legacy');
    if (decoded.kind !== 'Unmapped') {
      assert.deepEqual(encodeInputSource(
        decoded.kind, decoded.kind === 'Literal' ? String(value) : decoded.detail, fields,
        typeof value === 'number' ? 'Number' : typeof value === 'boolean' ? 'Boolean' : 'Text'
      ), value);
    }
  }
});

test('visual source compiler stores values the existing runtime understands', () => {
  assert.equal(encodeInputSource('Event Field', 'item.id', fields), '$event.item.id');
  assert.equal(encodeInputSource('Record Field', 'Price__c', fields), '$record.Price__c');
  assert.equal(encodeInputSource('Session', '', fields), '$session');
  assert.equal(encodeInputSource('Event', '', fields), '$event');
  assert.equal(encodeInputSource('Literal', '20.50', fields, 'Currency(18,2)'), 20.5);
  assert.equal(encodeInputSource('Literal', 'false', fields, 'Boolean'), false);
  assert.equal(encodeInputSource('Unmapped', '', fields), undefined);
});

test('unsafe event paths and stale record references fail closed without changing saved mapping', () => {
  for (const path of ['', 'constructor', 'item.__proto__', 'item[0]', 'item-id', 'item;alert(1)']) {
    assert.throws(() => encodeInputSource('Event Field', path, fields));
  }
  assert.throws(() => encodeInputSource('Record Field', 'Gone__c', fields), /available field/);
  assert.throws(() => encodeInputSource('Literal', '$event.item', fields), /reserved/);
  assert.throws(() => encodeInputSource('Literal', 'NaN', fields, 'Number'), /finite/);
  assert.throws(() => encodeInputSource('Literal', 'maybe', fields, 'Boolean'), /true or false/);
  assert.equal(decodeInputSource({ bad: 'legacy' }).kind, 'Legacy');
});

test('unmapped inputs and legacy keys remain visible without being silently erased', () => {
  assert.equal(decodeInputSource(undefined, false).kind, 'Unmapped');
  assert.equal(decodeInputSource('$event.').kind, 'Legacy');
  assert.deepEqual(mappedInputNames(undefined, { existing: 'retain' }), ['existing']);
});
