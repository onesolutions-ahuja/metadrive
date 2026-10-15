import test from 'node:test';
import assert from 'node:assert/strict';
import { assertWritableRecordFields } from '../src/modules/records/record-write-fields.js';
import { sanitizeRecordValues } from '../src/modules/records/record-input.js';

const object = { apiName: 'Custom__c', fields: [
  { apiName: 'Name', dataType: 'Text' }, { apiName: 'CreatedDate', dataType: 'DateTime' }
] };

test('agent1: valid metadata fields pass through the existing record normalization', () => {
  assert.deepEqual(sanitizeRecordValues(object, { Name: 'Example' }), { Name: 'Example' });
  assert.doesNotThrow(() => assertWritableRecordFields(object, { RecordTypeId: 'rt' }));
});

test('agent1: undeclared and audit fields remain rejected', () => {
  assert.throws(() => sanitizeRecordValues(object, { Unknown: 'x' }), /does not exist/);
  assert.throws(() => sanitizeRecordValues(object, { CreatedDate: '2026-01-01T00:00:00Z' }), /read-only/);
  assert.throws(() => assertWritableRecordFields({ apiName: 'Case', fields: [{ apiName: 'IsClosed' }] }, { IsClosed: true }), /read-only/);
});
