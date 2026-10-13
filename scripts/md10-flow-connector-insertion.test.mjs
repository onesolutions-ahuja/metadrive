import assert from 'node:assert/strict';
import test from 'node:test';
import { insertFlowElementAtPath } from '../apps/web/src/flowInsertElement.mjs';

const choice = { id: 8, type: 'Assignment', label: 'Set data', config: {} };
const source = {
  elements: [{ id: 1, type: 'Start', config: {} },
    { id: 2, type: 'Decision', config: {} },
    { id: 3, type: 'Assignment', config: {} },
    { id: 4, type: 'Assignment', config: {} }],
  connectors: [
    { id: 'start-decision', from: 1, to: 2, kind: 'normal', label: '' },
    { id: 'decision-yes', from: 2, to: 3, kind: 'normal', label: 'Yes' },
    { id: 'decision-no', from: 2, to: 4, kind: 'normal', label: 'No' }
  ]
};
test('a decision cannot silently lose outcome connectors when adding a node', () => {
  assert.throws(() => insertFlowElementAtPath(source, 2, choice, undefined, 'new-path'), /Select an outcome path/);
  assert.deepEqual(source.connectors.map(c => c.id), ['start-decision', 'decision-yes', 'decision-no']);
});
test('splitting a decision outcome retains its label and the other branches', () => {
  const inserted = insertFlowElementAtPath(source, 2, choice, 'decision-yes', 'new-path');
  assert.deepEqual(inserted.connectors, [
    source.connectors[0],
    { id: 'decision-yes', from: 2, to: 8, kind: 'normal', label: 'Yes' },
    { id: 'new-path', from: 8, to: 3, kind: 'normal', label: '' },
    source.connectors[2]
  ]);
  assert.deepEqual(inserted.elements.map(e => e.id), [1, 2, 8, 3, 4]);
});
test('fault and scheduled edges preserve their identity and settings', () => {
  for (const kind of ['fault', 'scheduled', 'async']) {
    const edge = { id: kind, from: 1, to: 3, label: kind,
      kind, ...(kind === 'scheduled' ? { scheduledPath: { timeSourceFieldApiName: 'Date__c', offsetAmount: 2, offsetUnit: 'Days' } } : {}) };
    const graph = { elements: source.elements, connectors: [edge] };
    const result = insertFlowElementAtPath(graph, 1, choice, undefined, 'after-'+kind);
    assert.deepEqual(result.connectors[0], { ...edge, to: choice.id });
    assert.deepEqual(result.connectors[1], { id: 'after-'+kind, from: choice.id, to: 3, kind: 'normal', label: '' });
  }
});
test('an unconnected element creates one normal path, never a fictional link to its list neighbour', () => {
  const graph = { ...source, connectors: [] };
  const result = insertFlowElementAtPath(graph, 2, choice, undefined, 'new-path');
  assert.deepEqual(result.connectors, [{ id: 'new-path', from: 2, to: 8, label: '', kind: 'normal' }]);
});
test('stale connector IDs and reused IDs reject changes safely', () => {
  assert.throws(() => insertFlowElementAtPath(source, 2, choice, 'wrong', 'new-path'), /no longer belongs/);
  assert.throws(() => insertFlowElementAtPath(source, 2, choice, 'decision-yes', 'decision-no'), /unique/);
  assert.throws(() => insertFlowElementAtPath(source, 123, choice, undefined, 'new-path'), /Select a valid/);
  assert.throws(() => insertFlowElementAtPath(source, 2, { ...choice, id: 3 }, 'decision-yes', 'new-path'), /IDs must be unique/);
});
