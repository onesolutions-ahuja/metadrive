import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync('apps/web/src/App.tsx', 'utf8');
const till = readFileSync('apps/web/src/custom-components/TillSalesWorkspace/TillSalesWorkspace.jsx', 'utf8');
const css = readFileSync('apps/web/src/custom-components/TillSalesWorkspace/TillSalesWorkspace.css', 'utf8');
const preset = JSON.parse(readFileSync('apps/web/src/page-presets/till.editable.json', 'utf8'));

test('phase 2 canvas preserves the existing Page Builder, filters, conditions and actions', () => {
  for (const token of ['PageComponentVisualEditor', 'PageComponentStyleEditor',
    'RecordFilterEditor', 'ComponentVisibilityEditor', 'FlowInputBindingEditor',
    'resolvePageComponentStyle', 'updateComponent', 'applyPage'])
    assert.ok(src.includes(token), token);
  assert.match(src, /modern-inspector-tabs/);
  assert.match(src, /Canvas layers/);
  assert.match(src, /canvasSnap/);
  assert.match(src, /ArrowLeft.*ArrowRight.*ArrowUp.*ArrowDown/);
});

test('existing Till preset still loads as one configured component without migration', () => {
  assert.equal(preset.layoutMode, 'free-canvas');
  assert.equal(preset.components.length, 1);
  const component = preset.components[0];
  assert.equal(component.type, 'Custom:TillSalesWorkspace');
  assert.equal(component.properties.basketWidthPercent, undefined);
  assert.equal(component.properties.catalogFirst, undefined);
  assert.ok(component.properties.actionFlows.add);
  assert.equal(component.properties.objectApiName, 'Product__c');
});

test('Till client layout uses metadata-only overrides, preserving legacy proportions', () => {
  assert.match(till, /p\.basketWidthPercent \?\? 45/);
  assert.match(till, /Math\.max\(25, Math\.min\(70/);
  assert.match(till, /p\.catalogFirst === true/);
  assert.match(css, /--md-till-basket-width,45%/);
  assert.match(css, /md-till-catalog-first/);
  assert.match(src, /Till basket width/);
  assert.match(src, /Show products before basket/);
  assert.ok(!till.includes('fetch('), 'Till still delegates records and mutations to metadata runtime');
  assert.match(till, /p\.onAction/);
});
