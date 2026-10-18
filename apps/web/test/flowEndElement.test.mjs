import test from 'node:test';
import assert from 'node:assert/strict';
import { insertFlowElementAtPath } from '../src/core/builders/FlowBuilder/flowInsertElement.mjs';

const start = { id: 1, type: 'Start', label: 'Start', config: {} };
const step = { id: 2, type: 'Assignment', label: 'Assign', config: {} };
const end = { id: 3, type: 'End', label: 'End', config: {} };
const link = (id, from, to) => ({ id, from, to, label: '', kind: 'normal' });

test('End terminates a leaf path without an outgoing connector', () => {
  const graph = { elements: [start, step], connectors: [link('a', 1, 2)] };
  const result = insertFlowElementAtPath(graph, 2, end, undefined, 'b');
  assert.deepEqual(result.connectors, [link('a', 1, 2), link('b', 2, 3)]);
  assert.equal(result.connectors.some(c => c.from === 3), false);
});

test('End cannot split an existing connector and create an invalid outgoing path', () => {
  const graph = { elements: [start, step], connectors: [link('a', 1, 2)] };
  assert.throws(() => insertFlowElementAtPath(graph, 1, end, 'a', 'b'), /End must terminate a path/);
});

test('No element may be inserted after End', () => {
  const graph = { elements: [start, end], connectors: [link('a', 1, 3)] };
  assert.throws(() => insertFlowElementAtPath(graph, 3, step, undefined, 'b'), /Cannot add after an End/);
});
