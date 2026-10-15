import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAuthorisedRecords, orderAuthorisedRecords, pageAuthorisedRecords } from '../src/modules/records/query-page.js';

test('agent1: generic record pagination does not mutate input and preserves response keys', () => {
  const records = [{ Id: 'a' }, { Id: 'b' }, { Id: 'c' }];
  assert.deepEqual(pageAuthorisedRecords(records, 1, 1), {
    records: [{ Id: 'b' }], total: 3, offset: 1, limit: 1
  });
  assert.equal(records.length, 3);
});

test('agent1: generic sorting supports metadata numeric fields and null-last', () => {
  const records = [{ Id: 'c', Price: null }, { Id: 'a', Price: 10 }, { Id: 'b', Price: 2 }];
  assert.deepEqual(orderAuthorisedRecords(records, { field: 'Price', direction: 'asc', dataType: 'Currency' }).map((r) => r.Id), ['b', 'a', 'c']);
  assert.deepEqual(orderAuthorisedRecords(records, { field: 'Price', direction: 'desc', dataType: 'Currency' }).map((r) => r.Id), ['a', 'b', 'c']);
  assert.equal(records[0]?.Id, 'c');
});

test('agent1: omitted sort retains authorised source ordering', () => {
  assert.deepEqual(orderAuthorisedRecords([{ Id: 'z' }, { Id: 'a' }]).map((r) => r.Id), ['z', 'a']);
});

test('agent1: filtering cannot search fields excluded from visible metadata', () => {
  const records = [{ Id: '1', Name: 'A', Secret: 'hidden' }, { Id: '2', Name: 'B', Secret: 'visible' }];
  assert.deepEqual(filterAuthorisedRecords(records, { needle: 'hidden', searchFields: ['Name'] }), []);
  assert.deepEqual(filterAuthorisedRecords(records, { needle: 'a', searchFields: ['Name'] }).map((r) => r.Id), ['1']);
});

test('agent1: related-list and exact filters compose before pagination', () => {
  const records = [{ Id: '1', Account: 'x', State: 'Active' }, { Id: '2', Account: 'y', State: 'Active' }, { Id: '3', Account: 'x', State: 'Closed' }];
  const filtered = filterAuthorisedRecords(records, { relatedField: 'Account', relatedId: 'x', filterField: 'State', filterValue: 'Active' });
  assert.deepEqual(pageAuthorisedRecords(filtered, 0, 50), { records: [records[0]], total: 1, offset: 0, limit: 50 });
});
