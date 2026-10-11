import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCalloutHostAllowed } from '../src/outbound-callout-policy.js';

test('host pause is opt-in and only blocks exact configured hosts', () => {
  assert.doesNotThrow(() => assertCalloutHostAllowed('graph.facebook.com', undefined));
  assert.doesNotThrow(() => assertCalloutHostAllowed('graph.facebook.com', ''));
  assert.doesNotThrow(() => assertCalloutHostAllowed('other.example.com', 'graph.facebook.com'));
  assert.doesNotThrow(() => assertCalloutHostAllowed('notgraph.facebook.com', 'graph.facebook.com'));
  assert.throws(() => assertCalloutHostAllowed('graph.facebook.com', 'graph.facebook.com'), /operator pause policy/);
  assert.throws(() => assertCalloutHostAllowed('GRAPH.FACEBOOK.COM.', ' api.example, GRAPH.FACEBOOK.COM '), /operator pause policy/);
});
