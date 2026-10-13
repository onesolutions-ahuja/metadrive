import assert from 'node:assert/strict';
import test from 'node:test';

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
    process.env.DATABASE_URL = url;
    process.env.PGSSLMODE = 'disable';
    const { withSchedulerLease } = await import('../src/postgres-state.js');
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


test('scheduler lease is recovered after an abruptly disconnected replica', { skip: !local }, async () => {
  process.env.DATABASE_URL = url;
  process.env.PGSSLMODE = 'disable';
  const { Client } = await import('pg');
  const { withSchedulerLease } = await import('../src/postgres-state.js');
  // Model a replica whose database connection dies without running the
  // scheduler callback's finally block. PostgreSQL must release its lock.
  const crashedReplica = new Client({ connectionString: url, ssl: false });
  await crashedReplica.connect();
  try {
    const lease = await crashedReplica.query(
      'SELECT pg_try_advisory_lock($1::integer, $2::integer) AS acquired',
      [1330463812, 1]
    );
    assert.equal(lease.rows[0]?.acquired, true);
    let invoked = false;
    assert.equal(await withSchedulerLease(async () => { invoked = true; }), false);
    assert.equal(invoked, false, 'second replica must not dispatch before crash');
  } finally {
    // Closing the session without unlocking simulates crash recovery, rather
    // than the graceful release path exercised by the other integration test.
    await crashedReplica.end();
  }
  let recoveredDispatches = 0;
  assert.equal(await withSchedulerLease(async () => { recoveredDispatches++; }), true);
  assert.equal(recoveredDispatches, 1, 'outstanding work must have one lease holder');
});
