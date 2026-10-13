import assert from 'node:assert/strict';
import test from 'node:test';
import { storedFlowPosition, moveFlowPosition, flowCanvasBounds } from '../apps/web/src/flowCanvasLayout.mjs';

test('freeform canvas coordinates persist in Flow element metadata', () => {
  const flow = {
    elements: [{ id: 7, type: 'Decision', config: { outcomes: [], canvasPosition: { x: 310, y: 450 } } }],
    startConfig: { canvasLayoutMode: 'Freeform' }
  };
  const roundTrip = JSON.parse(JSON.stringify(flow));
  assert.deepEqual(storedFlowPosition(roundTrip.elements[0], { x: 20, y: 20 }), { x: 310, y: 450 });
  assert.equal(roundTrip.startConfig.canvasLayoutMode, 'Freeform');
});

test('freeform movement is zoom-aware, keyboard-friendly, and bounded', () => {
  assert.deepEqual(moveFlowPosition({ x: 100, y: 100 }, 40, -20, 0.5), { x: 180, y: 60 });
  assert.deepEqual(moveFlowPosition({ x: 5, y: 11_990 }, -100, 100), { x: 0, y: 12_000 });
  assert.deepEqual(moveFlowPosition({ x: 100, y: 100 }, 10, 0, 1), { x: 110, y: 100 });
  assert.throws(() => moveFlowPosition({ x: 100, y: 100 }, 10, 0, 0), /Invalid/);
});

test('corrupt canvas coordinates never alter execution or crash the editor', () => {
  const fallback = { x: 100, y: 200 };
  for (const invalid of [
    { x: Infinity, y: 0 }, { x: -1, y: 0 }, { x: 100, y: '200' },
    { x: null, y: 0 }, { x: 15_000, y: 0 }, '20,30', null
  ]) {
    assert.deepEqual(storedFlowPosition({ config: { canvasPosition: invalid } }, fallback), fallback);
  }
});

test('canvas expands to enclose all freely positioned nodes', () => {
  assert.deepEqual(flowCanvasBounds(new Map([[1, { x: 200, y: 800 }], [2, { x: 100, y: 300 }]]), 400, 600),
    { width: 576, height: 936 });
});
