import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { flowElementMetadata, type LibraryComponentMetadata, type FlowDefinitionMetadata } from '../src/core/metadata/Definitions/metadata';
import { insertFlowElementAtPath } from '../src/core/builders/FlowBuilder/flowInsertElement.mjs';
import ComponentLibrary from '../src/core/components/ComponentLibrary/ComponentLibrary';
import { libraryComponentLabel, oneComponentLabel, uniqueLibraryComponents } from '../src/core/components/Registry/componentLibraryDiscovery';
import { findRegisteredComponent } from '../src/core/components/Registry/componentRegistryLookup';
import { publishedPageLibraryComponents } from '../src/core/builders/PageBuilder/pageBuilderPalette';

function definition(apiName: string, patch: Partial<LibraryComponentMetadata> = {}): LibraryComponentMetadata {
  return { apiName, label: apiName, description: '', surfaces: ['page', 'dashboard', 'flow'],
    version: 1, status: 'Published', updatedAt: '', jsxSource: '', cssSource: '', compiledJs: '', scopedCss: '', ...patch };
}

test('One- names have one prefix while platform names and API references stay stable', () => {
  for (const label of ['Card', 'OneCard', 'One Card', 'One-Card']) {
    assert.equal(oneComponentLabel({ label, apiName: 'OneCard' }), 'One-Card');
  }
  const platform = definition('SystemPanel', { scope: 'platform-system', label: 'System Panel' });
  assert.equal(libraryComponentLabel(platform), 'System Panel');
  const custom = definition('Calendar', { label: 'Calendar' });
  assert.equal(libraryComponentLabel(custom), 'One-Calendar');
  assert.equal(custom.apiName, 'Calendar');
});

test('each builder offers one published definition per identity and supported surface', () => {
  const components = [definition('OneCard', { status: 'Draft', version: 4 }),
    definition('OneCard'), definition('OneCard', { version: 2 }),
    definition('FlowOnly', { surfaces: ['flow'] }), definition('Invalid-Name')];
  for (const surface of ['page', 'dashboard', 'flow'] as const) {
    const available = uniqueLibraryComponents(components, surface);
    assert.deepEqual(available.map(item => item.apiName), surface === 'flow' ? ['OneCard', 'FlowOnly'] : ['OneCard']);
    assert.equal(available[0].version, 2);
    assert.equal(findRegisteredComponent(components, 'OneCard', surface)?.version, 2);
  }
  assert.deepEqual(publishedPageLibraryComponents(components), uniqueLibraryComponents(components, 'page'));
});

test('bundled alias is hidden from new placements while saved placements remain resolvable', () => {
  const alias = definition('ChatterInbox', { trustedBundled: true });
  const canonical = definition('OneConversation', { trustedBundled: true });
  for (const surface of ['page', 'dashboard', 'flow'] as const) {
    assert.deepEqual(uniqueLibraryComponents([alias, canonical], surface), [canonical]);
    assert.equal(findRegisteredComponent([alias, canonical], alias.apiName, surface), alias);
  }
  assert.deepEqual(uniqueLibraryComponents([alias]), [alias]);
  assert.equal(uniqueLibraryComponents([alias, { ...canonical, status: 'Draft' }]).length, 2);
  assert.equal(uniqueLibraryComponents([{ ...alias, trustedBundled: false }, canonical]).length, 2);
  assert.equal(uniqueLibraryComponents([alias, { ...canonical, surfaces: ['page'] }]).length, 2);
});

test('equal labels do not erase distinct custom components or mutate registry metadata', () => {
  const entries = [definition('First', { label: 'Card' }), definition('Second', { label: 'Card' })];
  const before = structuredClone(entries);
  assert.equal(uniqueLibraryComponents(entries).length, 2);
  assert.deepEqual(entries, before);
});

test('library starts in Core with two library choices and no custom registration form', () => {
  const markup = renderToStaticMarkup(React.createElement(ComponentLibrary, {
    components: [], canManage: true,
    onSave: async () => {}, onDelete: async () => {}, onPublish: async () => {}, onRollback: async () => {}
  }));
  assert.match(markup, /Core library/);
  assert.match(markup, /One- library/);
  assert.match(markup, /Core · Page components/);
  assert.doesNotMatch(markup, /id="library-component-label"/);
});

test('Flow Builder offers End and only inserts it on a terminal connector path', () => {
  assert.equal(flowElementMetadata.filter(item => item.type === 'End').length, 1);
  const flow = {
    elements: [
      { id: 1, type: 'Start', label: 'Start', config: {} },
      { id: 2, type: 'Screen', label: 'Checkout', config: { fields: [] } }
    ],
    connectors: [{ id: 'connector-1', from: 1, to: 2, label: '', kind: 'normal' }]
  } as unknown as FlowDefinitionMetadata;
  const end = { id: 3, type: 'End', label: 'End', config: {} };
  const completed = insertFlowElementAtPath(flow, 2, end, undefined, 'connector-2');
  assert.equal(completed.elements.at(-1)?.type, 'End');
  assert.ok(completed.connectors.some(connector => connector.from === 2 && connector.to === 3));
  assert.equal(completed.connectors.some(connector => connector.from === 3), false);
  assert.throws(() => insertFlowElementAtPath(flow, 1, end, undefined, 'connector-2'), /End must terminate a path/);
});
