import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

// Static fail-closed integration contract; PostgreSQL concurrency/restart tests
// remain a separate release gate, not a substitute for these checks.
test('scheduler dispatch uses database-wide lease and durable commit boundary', () => {
  const runtime = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../src/postgres-state.ts', import.meta.url), 'utf8');
  assert.match(runtime, /await withSchedulerLease\(async \(\) => \{/);
  assert.match(runtime, /await waitForPersistedState\(\);\s*\}\);/);
  assert.match(store, /pg_try_advisory_lock/);
  assert.match(store, /pg_advisory_unlock/);
  assert.match(store, /client\.release\(\)/);
});

test('scheduler refresh retries local snapshot races without overwriting a newer CAS baseline', () => {
  const store = readFileSync(new URL('../src/postgres-state.ts', import.meta.url), 'utf8');
  assert.match(store, /for \(let attempt = 0; attempt < 5; attempt\+\+\)/);
  assert.match(store, /await waitForPersistedState\(\);\s*const previousSnapshot = normalizedSnapshot;/);
  assert.match(store, /if \(normalizedSnapshot !== previousSnapshot\) continue;/);
  assert.match(store, /normalizedSnapshot = refreshed;\s*return refreshed\.state;/);
});
