import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import type { LibraryComponentMetadata } from '../src/core/metadata/Definitions/metadata';
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
