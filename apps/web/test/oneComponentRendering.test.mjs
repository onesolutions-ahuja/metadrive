import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadComponentCatalog, buildBundledComponent } from '../../../scripts/component-catalog.mjs';
import { componentAppearance } from '../src/one/shared/componentAppearance.js';

// These snapshots were captured from the original grouped renderers before
// extraction. Verify every named component still produces the same markup.
const fixtures = JSON.parse(await readFile(new URL('./fixtures/one-rendering.json', import.meta.url), 'utf8'));
const { components } = await loadComponentCatalog();
class FixtureDate extends Date {
  constructor(...args) { super(...(args.length ? args : ['2026-10-18T12:00:00.000Z'])); }
  static now() { return 1792324800000; }
}
for (const fixture of fixtures) {
  test(`${fixture.apiName} preserves original rendering after extraction`, async () => {
    const definition = components.find(item => item.apiName === fixture.apiName);
    assert.ok(definition);
    const built = await buildBundledComponent(definition);
    const context = { React, module: { exports: {} }, Date: FixtureDate, Intl, URL, crypto: globalThis.crypto };
    vm.runInNewContext(built.compiledJs, context);
    const html = renderToStaticMarkup(React.createElement(context.module.exports.default, fixture.props));
    if (fixture.apiName === 'OneTable') {
      // Phase 4 intentionally changes table markup for accessible sort headers.
      assert.match(html, /class="one-table"/);
      assert.match(html, /aria-sort="none"/);
      assert.match(html, /Example record/);
      assert.match(html, /<thead>/);
    } else {
      assert.equal(html, fixture.html);
    }
    assert.match(built.cssSource, /\.one-ui\s*\{/);
    assert.doesNotMatch(built.cssSource, /@import/);
    assert.doesNotMatch(built.compiledJs, /require\(["'](?:react|\.\.)/);
  });
}

test('component packaging rejects sources outside the component libraries', async () => {
  await assert.rejects(buildBundledComponent({ jsxFile: 'main.tsx', cssFile: 'one/shared/one.css' }), /escapes its source library/);
});

test('shared appearance preserves each original family, including numeric and theme edge cases', async () => {
  const cases = JSON.parse(await readFile(new URL('./fixtures/one-appearance.json', import.meta.url), 'utf8'));
  for (const item of cases) assert.deepEqual(JSON.parse(JSON.stringify(componentAppearance(item.props, item.profile))), item.expected);
});


test('opt-in visual properties remain on existing reusable component definitions', async () => {
  const map = new Map(components.map(c => [c.apiName, c]));
  const required = {
    OneRepeater: ['recordImageFieldApiName','recordSortFieldApiName','recordActiveFieldApiName',
      'recordLayout','recordItemMinHeight','selectedItemBackgroundColor','showAllItem'],
    OneTabs: ['showPanel','tabStyle','showAllTab','relatedFilterKey','relatedFieldApiName'],
    OneItemGrid: ['showHeading','recordSortFieldApiName','recordActiveFieldApiName',
      'badgeFieldApiName','featuredFieldApiName','featuredColumnSpan'],
    OneCard: ['imageSrc','imagePosition','imageWidthPercent','showSurface'],
    OneOverlay: ['showSelectedRecord','selectedImageFieldApiName','confirmBehavior','cartTargetKey'],
    OneShoppingCart: ['basketPresentation','basketTitle','checkoutLabel'],
  };
  for (const [apiName, fields] of Object.entries(required)) {
    const definition = map.get(apiName);
    assert.ok(definition, apiName + ' reuses the existing library identity');
    const keys = new Set(definition.propertyDefinitions.map(p => p.propertyKey));
    for (const field of fields) assert.ok(keys.has(field), apiName + ' exposes '+field);
  }
});

test('reusable record tabs can render chips without a content panel', async () => {
  const definition = components.find(c => c.apiName === 'OneTabs');
  const built = await buildBundledComponent(definition);
  const context = {React,module:{exports:{}},Intl,Date,URL,crypto:globalThis.crypto};
  vm.runInNewContext(built.compiledJs,context);
  const html = renderToStaticMarkup(React.createElement(context.module.exports.default,
    {kind:'Tabs',tabs:'Burgers,Chicken',tabStyle:'pill',showPanel:false,showAllTab:true}));
  assert.match(html,/role="tablist"/);
  assert.match(html,/Burgers/);
  assert.match(html,/Chicken/);
  assert.doesNotMatch(html,/role="tabpanel"/);
});

test('reusable item grid renders product imagery, names, prices and badges', async () => {
  const definition = components.find(c => c.apiName === 'OneItemGrid');
  const built = await buildBundledComponent(definition);
  const context = {React,module:{exports:{}},Intl,Date,URL,crypto:globalThis.crypto};
  vm.runInNewContext(built.compiledJs,context);
  const html = renderToStaticMarkup(React.createElement(context.module.exports.default,{
    kind:'ItemGrid',showHeading:false, titleFieldApiName:'Name',imageFieldApiName:'ImageUrl',
    priceFieldApiName:'Price',currencyCode:'GBP',badgeFieldApiName:'Badge',featuredFieldApiName:'Featured',
    featuredColumnSpan:2,records:[{Id:'x',Name:'Example burger',Price:4.5,Badge:'Popular',Featured:true,
      ImageUrl:'https://example.com/test.jpg'}]
  }));
  assert.match(html,/Example burger/);
  assert.match(html,/Popular/);
  assert.match(html,/md-product-image/);
  assert.match(html,/span 2/);
  assert.doesNotMatch(html,/<h3/);
});
