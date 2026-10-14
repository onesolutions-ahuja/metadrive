import assert from 'node:assert/strict';
import test from 'node:test';
import {
  snapCanvasPosition, snapCanvasSize, wrapCanvasComponent,
  ungroupCanvasComponent, isCanvasLocked
} from '../apps/web/src/canvasInteractions.ts';
import { resolvePageComponentStyle } from '../apps/web/src/pageComponentLayout.ts';

const component = {
  id: 'basket', type: 'Custom:InventoryWorkspace', label: 'Inventory',
  visible: true, region: 'main', position: { x: 37, y: 28, width: 320, height: 240 },
  properties: { objectApiName: 'Product__c', basketSide: 'left', actionFlows: { add: { flowApiName: 'CART_ADD' } } }
};
test('pointer movement snaps to grid without overwriting size or input metadata', () => {
  const start = structuredClone(component);
  const next = snapCanvasPosition({ ...start.position, x: 53, y: 72 },
    { width: 1200, height: 800 }, [], true);
  assert.deepEqual(next.position, { x: 56, y: 72, width: 320, height: 240 });
  assert.deepEqual(start, component);
});
test('magnetic alignment honours nearby component edges and does not exceed canvas', () => {
  const next = snapCanvasPosition(
    { x: 95, y: 110, width: 100, height: 100 },
    { width: 600, height: 400 }, [{ x: 200, y: 104, width: 140, height: 80 }], false);
  assert.equal(next.position.x, 100);
  assert.equal(next.guides.x, true);
  assert.equal(next.position.y, 104);
  assert.equal(next.guides.y, true);
  const edge = snapCanvasPosition({ x: 999, y: -12, width: 100, height: 100 }, { width: 600, height: 400 }, [], true);
  assert.equal(edge.position.x, 500);
  assert.equal(edge.position.y, 0);
});
test('resizing respects component minimums, grid and canvas bounds', () => {
  const original = component.position;
  const big = snapCanvasSize(original, 9999, 9999, { width: 500, height: 500 }, { width: 120, height: 60 }, true);
  assert.equal(big.width, 463);
  assert.equal(big.height, 472);
  const small = snapCanvasSize(original, 0, 0, { width: 500, height: 500 }, { width: 120, height: 60 }, true);
  assert.equal(small.width, 120);
  assert.equal(small.height, 60);
});
test('grouping preserves working Flow, filters and tenant client overrides', () => {
  const group = wrapCanvasComponent([component], 'basket', 'group-1');
  assert.equal(group.length, 2);
  assert.equal(group[0].type, 'Container');
  assert.equal(group[1].parentId, 'group-1');
  assert.equal(group[1].properties.layoutParentId, 'group-1');
  assert.deepEqual(group[1].properties.actionFlows, component.properties.actionFlows);
  assert.equal(group[1].properties.objectApiName, 'Product__c');
  const saved = JSON.parse(JSON.stringify(group));
  const restored = ungroupCanvasComponent(saved, 'group-1');
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0].position, component.position);
  assert.equal(restored[0].parentId, undefined);
  assert.equal(restored[0].properties.layoutParentId, undefined);
});
test('locking is metadata-only, preserves design and prevents regrouping', () => {
  const locked = { ...component, properties: { ...component.properties, editorLocked: true } };
  assert.equal(isCanvasLocked(locked), true);
  assert.equal(wrapCanvasComponent([locked], locked.id, 'new').length, 1);
  assert.equal(isCanvasLocked(component), false);
  assert.equal(resolvePageComponentStyle(locked.properties, locked.type).opacity, undefined);
});
test('per-client component placement metadata survives serialization independently of Flow setup', () => {
  const a = structuredClone(component);
  const b = structuredClone(component);
  b.properties.basketSide = 'right';
  b.properties.basketWidthPercent = 60;
  b.properties.catalogColumns = 4;
  const pages = JSON.parse(JSON.stringify([a, b]));
  assert.equal(pages[0].properties.basketSide, 'left');
  assert.equal(pages[1].properties.basketSide, 'right');
  assert.equal(pages[1].properties.catalogColumns, 4);
  assert.deepEqual(pages[0].properties.actionFlows, pages[1].properties.actionFlows);
});
