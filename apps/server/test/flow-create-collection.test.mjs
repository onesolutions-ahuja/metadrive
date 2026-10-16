import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareFlowCreateCollection } from '../src/flow-create-collection.mjs';

const object = { apiName: 'Account', fields: [{ apiName: 'Name' }, { apiName: 'Balance__c' }] };
const resources = [
  { name: 'Accounts', type: 'Record Collection', dataType: 'Account', isCollection: true },
  { name: 'Contacts', type: 'Record Collection', dataType: 'Contact', isCollection: true },
  { name: 'Account', type: 'Record', dataType: 'Account', isCollection: false }
];
const prepare = (name, values) => prepareFlowCreateCollection(resources, name, object, values);
test('creates a validated copy of a typed Flow Record Collection', () => {
  const input = [{ Name: 'First', Balance__c: 3 }, { Name: 'Second', RecordTypeId: 'valid-type' }];
  const batch = prepare('Accounts', input);
  assert.deepEqual(batch, input);
  assert.notEqual(batch[0], input[0]);
  assert.deepEqual(prepare('Accounts', []), []);
});
test('rejects mismatched objects and resource kinds before database writes', () => {
  for (const name of ['Contacts', 'Account', 'missing', '']) {
    assert.throws(() => prepare(name, [{ Name: 'Ignored' }]), /Record Collection/);
  }
  assert.throws(() => prepare('Accounts', {}), /must contain records/);
});
test('rejects the entire batch when any item has immutable or unrecognized data', () => {
  for (const item of [{ Id: 'forged', Name: 'X' }, { Name: 'X', CreatedDate: '2000-01-01' },
    { Bogus__c: 'X' }, { OwnerId: 'unknown' }, null, ['not-a-record']]) {
    assert.throws(() => prepare('Accounts', [{ Name: 'Valid' }, item]));
  }
});
test('enforces a 200-record transaction cap before attempting creation', () => {
  assert.equal(prepare('Accounts', Array.from({ length: 200 }, (_, i) => ({ Name: 'Account ' + i }))).length, 200);
  assert.throws(() => prepare('Accounts', Array.from({ length: 201 }, (_, i) => ({ Name: 'Account ' + i }))), /200-record/);
});
