import assert from 'node:assert/strict';
import test from 'node:test';
import { withSchedulerLease } from '../src/postgres-state.js';

// Run only against an explicitly configured, disposable local PostgreSQL test DB.
// Production Aiven is never a valid target for this test.
const url = process.env.METADRIVE_TEST_DATABASE_URL;
const local = (() => {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname)
      && parsed.pathname === '/postgres';
  } catch { return false; }
})();
test('scheduler lease serializes overlapping dispatches and releases after failures',
  { skip: !local }, async () => {
    let entered = false;
    let releaseFirst!: () => void;
    const hold = new Promise<void>(resolve => { releaseFirst = resolve; });
    const first = withSchedulerLease(async () => {
      entered = true;
      await hold;
    });
    try {
      // Wait for the first callback to acquire the PostgreSQL advisory lock.
      for (let i = 0; i < 100 && !entered; i++)
        await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(entered, true);
      let competingRan = false;
      const competing = await withSchedulerLease(async () => { competingRan = true; });
      assert.equal(competing, false);
      assert.equal(competingRan, false);
    } finally {
      releaseFirst();
      await first;
    }
    await assert.rejects(withSchedulerLease(async () => {
      throw Error('simulated dispatcher failure');
    }), /simulated dispatcher failure/);
    let recovered = false;
    assert.equal(await withSchedulerLease(async () => { recovered = true; }), true);
    assert.equal(recovered, true);
  });
