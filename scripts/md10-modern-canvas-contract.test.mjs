import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canvasBoundPosition } from '../apps/web/src/pageCanvas.ts';

const src = readFileSync('apps/web/src/App.tsx', 'utf8');

test('phase 2 canvas preserves the existing Page Builder, filters, conditions and actions', () => {
  for (const token of ['PageComponentVisualEditor', 'PageComponentStyleEditor',
    'RecordFilterEditor', 'ComponentVisibilityEditor', 'FlowInputBindingEditor',
    'resolvePageComponentStyle', 'updateComponent', 'applyPage'])
    assert.ok(src.includes(token), token);
  assert.match(src, /modern-inspector-tabs/);
  assert.match(src, /Page component layers/);
  assert.match(src, /builder-compact-toolbar/);
  assert.match(src, /page-manager-table/);
  assert.match(src, /properties-panel-resize/);
  assert.match(src, /canvasSnap/);
  assert.match(src, /ArrowLeft.*ArrowRight.*ArrowUp.*ArrowDown/);
});

test('direct canvas manipulation snaps to grid and clamps to edges', () => {
  const rect = { x: 105, y: 43, width: 320, height: 180 };
  assert.deepEqual(canvasBoundPosition(rect, { width: 800, height: 600 }), { x: 104, y: 40 });
  assert.deepEqual(canvasBoundPosition(rect, { width: 800, height: 600 }, false), { x: 105, y: 43 });
  assert.deepEqual(canvasBoundPosition({ ...rect, x: -30, y: 999 },
    { width: 800, height: 600 }), { x: 0, y: 420 });
  assert.deepEqual(canvasBoundPosition({ ...rect, x: 999, y: -50 },
    { width: 800, height: 600 }), { x: 480, y: 0 });
});

test('drag and layer lock use design metadata, not application actions', () => {
  assert.match(src, /data-canvas-move-handle/);
  assert.match(src, /canvasMoveStart\.current/);
  assert.match(src, /style\.transform/);
  assert.match(src, /Lock component position and size/);
  assert.match(src, /canvasLocked/);
  assert.match(src, /reorderLayer/);
  assert.match(src, /updateComponent\(start\.id, \{ position:/);
});
