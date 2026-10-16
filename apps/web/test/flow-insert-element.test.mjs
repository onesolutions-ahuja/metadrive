import assert from 'node:assert/strict';
import test from 'node:test';
import { insertFlowElementAtPath } from '../src/flowInsertElement.mjs';

const initial = () => ({
  elements: [{ id: 'start', type: 'Start' }, { id: 'end', type: 'End' }],
  connectors: [{ id: 'edge-1', from: 'start', to: 'end', kind: 'normal', label: '' }]
});
const element = { id: 'action', type: 'Assignment' };

test('inserts in a valid path and retains original edge metadata', () => {
  const input = initial();
  const output = insertFlowElementAtPath(input, 'start', element, 'edge-1', 'edge-2');
  assert.deepEqual(output.connectors, [
    { id: 'edge-1', from: 'start', to: 'action', kind: 'normal', label: '' },
    { id: 'edge-2', from: 'action', to: 'end', kind: 'normal', label: '' }
  ]);
  assert.equal(input.connectors[0].to, 'end');
});

test('rejects dangling destination without modifying graph', () => {
  const input = initial();
  input.connectors[0].to = 'deleted-element';
  assert.throws(() => insertFlowElementAtPath(input, 'start', element, 'edge-1', 'edge-2'), /missing destination/);
  assert.equal(input.elements.length, 2);
});

test('rejects duplicate outgoing connector IDs before rewiring', () => {
  const input = initial();
  input.connectors.push({ id: 'edge-1', from: 'start', to: 'end', kind: 'fault', label: '' });
  assert.throws(() => insertFlowElementAtPath(input, 'start', element, 'edge-1', 'edge-2'), /duplicate connector IDs/);
});

test('requires explicit outcome choice for branching paths', () => {
  const input = initial();
  input.connectors.push({ id: 'edge-fault', from: 'start', to: 'end', kind: 'fault', label: '' });
  assert.throws(() => insertFlowElementAtPath(input, 'start', element, undefined, 'edge-2'), /Select an outcome path/);
  const output = insertFlowElementAtPath(input, 'start', element, 'edge-fault', 'edge-2');
  assert.equal(output.connectors[1].kind, 'fault');
  assert.equal(output.connectors[1].to, 'action');
});
