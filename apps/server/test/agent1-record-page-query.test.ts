import test from 'node:test';
import assert from 'node:assert/strict';
import { recordPageRequest } from '../src/modules/records/record-page-query.js';

test('agent1: existing unpaged record reads remain unpaged', () => {
  assert.deepEqual(recordPageRequest({}), { paginated: false, limit: 50, offset: 0, valid: true });
});
test('agent1: search requests are paged with default bounds', () => {
  assert.deepEqual(recordPageRequest({ search: 'hello' }), { paginated: true, limit: 50, offset: 0, valid: true });
});
test('agent1: reject invalid requested page bounds without truncation', () => {
  for (const query of [{ limit: '0' }, { limit: '201' }, { offset: '-1' }, { offset: '1.2' }, { limit: 'NaN' }])
    assert.equal(recordPageRequest(query).valid, false);
  assert.equal(recordPageRequest({ limit: '200', offset: '0' }).valid, true);
});
