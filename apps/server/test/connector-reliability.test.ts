import assert from 'node:assert/strict';
import test from 'node:test';
import { CalloutCircuitBreaker, CalloutFault, executeReliableCallout, retryAfterMs } from '../src/connector-reliability.js';
const scope = { tenantId: 'tenant-A', credentialId: 'connector-B' };
test('read-only transient requests retry and are audited without sensitive payloads', async () => {
  let attempts = 0; const delays: number[] = []; const events: unknown[] = [];
  const result = await executeReliableCallout({ ...scope, method: 'GET', policy: { maxAttempts: 3 },
    send: async () => (++attempts === 1 ? { status: 503 } : { status: 200 }),
    sleep: async ms => { delays.push(ms); }, audit: event => { events.push(event); } });
  assert.equal(result.status, 200); assert.equal(attempts, 2); assert.deepEqual(delays, [250]);
  assert.equal(JSON.stringify(events).includes('secret'), false);
});
test('unsafe request without idempotency key is never retried', async () => {
  let calls = 0;
  await assert.rejects(executeReliableCallout({ ...scope, method: 'POST', policy: { maxAttempts: 5 },
    send: async () => { calls++; return { status: 503 }; } }), (e: unknown) => e instanceof CalloutFault && e.attempts === 1);
  assert.equal(calls, 1);
});
test('idempotent POST honours retry-after; 401 never retried', async () => {
  let calls = 0; const delays: number[] = [];
  await executeReliableCallout({ ...scope, method: 'POST', idempotencyKey: 'unique-operation', policy: { maxAttempts: 2 },
    send: async () => (++calls === 1 ? { status: 429, headers: { 'Retry-After': '2' } } : { status: 201 }),
    sleep: async delay => { delays.push(delay); } });
  assert.deepEqual(delays, [2000]);
  calls = 0;
  await assert.rejects(executeReliableCallout({ ...scope, method: 'GET', policy: { maxAttempts: 5 },
    send: async () => { calls++; return { status: 401 }; } }), (e: unknown) => e instanceof CalloutFault && e.code === 'AUTH_FAILURE');
  assert.equal(calls, 1);
});
test('retry-after date capped and malformed values ignored', () => {
  assert.equal(retryAfterMs({ 'retry-after': '9999' }), 60_000);
  assert.equal(retryAfterMs({ 'Retry-After': 'bad' }), null);
});
test('circuit breaker is tenant-isolated and closes after recovery', () => {
  let clock = 1000; const breaker = new CalloutCircuitBreaker(2, 1000, () => clock);
  breaker.record('A','C',false); breaker.record('A','C',false);
  assert.throws(() => breaker.assertAllowed('A','C'), (e: unknown) => e instanceof CalloutFault && e.code === 'CIRCUIT_OPEN');
  breaker.assertAllowed('B','C'); clock += 1001; breaker.assertAllowed('A','C');
  breaker.record('A','C',true); breaker.assertAllowed('A','C');
});
