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
    } else if (fixture.apiName === 'OneNavigation') {
      // Empty navigation now exposes its empty state to assistive technology.
      assert.match(html, /class="one-empty" role="status">Add navigation items<\/div>/);
    } else if (!['OneOverlay','OneMenu','OneTabs','OneButton','OneInput','OneSearch','OneRecordForm','OneItemGrid','OneBoard','OneTimeline','OneChart','OneDocumentViewer','OneDashboardEmbed','OneConversation','OneShoppingCart'].includes(fixture.apiName)) {
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
      'recordLayout','recordOrientation','recordWrap','recordItemMinHeight',
      'selectedItemBackgroundColor','showAllItem','imageFit'],
    OneTabs: ['showPanel','tabStyle','showAllTab','relatedFilterKey','relatedFieldApiName'],
    OneItemGrid: ['showHeading','recordSortFieldApiName','recordActiveFieldApiName',
      'badgeFieldApiName','featuredFieldApiName','featuredColumnSpan','cardDensity',
      'featuredRowSpan',
      'cardPadding','cardRadius','cardMinHeight','cardBackgroundColor','cardBorderColor',
      'cardBorderWidth','cardShadow','cardHover','imageHeight','imageFit','imageAspectRatio'],
    OneChoice: ['optionImageFieldApiName','optionLayout','optionColumns','optionMinHeight',
      'optionImageHeight','optionImageFit','selectedOptionBackgroundColor','selectedOptionTextColor'],
    OneCard: ['imageSrc','imagePosition','imageWidthPercent','imageFit','showSurface'],
    OneImage: ['imageHeight','imageFit','imageAspectRatio'],
    OneOverlay: ['showSelectedRecord','selectedImageFieldApiName','confirmBehavior','cartTargetKey',
      'imageHeight','imageFit','imageAspectRatio'],
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
    featuredColumnSpan:2,featuredRowSpan:2,records:[{Id:'x',Name:'Example burger',Price:4.5,Badge:'Popular',Featured:true,
      ImageUrl:'https://example.com/test.jpg'}]
  }));
  assert.match(html,/Example burger/);
  assert.match(html,/Popular/);
  assert.match(html,/md-product-image/);
  assert.match(html,/span 2/);
  assert.match(html,/grid-row:span 2/);
  assert.doesNotMatch(html,/<h3/);
});

test('reusable repeater supports horizontal record rows and wrapping', async () => {
  const definition = components.find(c => c.apiName === 'OneRepeater');
  const built = await buildBundledComponent(definition);
  const context = {React,module:{exports:{}},Intl,Date,URL,crypto:globalThis.crypto};
  vm.runInNewContext(built.compiledJs,context);
  const html = renderToStaticMarkup(React.createElement(context.module.exports.default,{
    kind:'Repeater',objectApiName:'MenuCategory',recordTitleFieldApiName:'Name',
    recordValueFieldApiName:'Id',recordLayout:'pill',recordOrientation:'horizontal',
    recordWrap:true,recordItemMinHeight:44,
    records:[{Id:'burgers',Name:'Burgers'},{Id:'chicken',Name:'Chicken'}]
  }));
  assert.match(html,/flex-direction:row/);
  assert.match(html,/flex-wrap:wrap/);
  assert.match(html,/flex:0 0 auto/);
  assert.match(html,/Burgers/);
  assert.match(html,/Chicken/);
});

test('reusable item grid applies metadata-driven card and image presentation', async () => {
  const definition = components.find(c => c.apiName === 'OneItemGrid');
  const built = await buildBundledComponent(definition);
  const context = {React,module:{exports:{}},Intl,Date,URL,crypto:globalThis.crypto};
  vm.runInNewContext(built.compiledJs,context);
  const html = renderToStaticMarkup(React.createElement(context.module.exports.default,{
    kind:'ItemGrid',showHeading:false,titleFieldApiName:'Name',imageFieldApiName:'ImageUrl',
    priceFieldApiName:'Price',currencyCode:'GBP',cardDensity:'image-focused',
    cardPadding:10,cardRadius:8,cardMinHeight:240,cardBackgroundColor:'#ffffff',
    cardBorderColor:'#eaeaea',cardBorderWidth:2,cardShadow:'small',cardHover:'lift',
    imageHeight:175,imageFit:'cover',imageAspectRatio:'4/3',
    records:[{Id:'x',Name:'Example burger',Price:4.5,ImageUrl:'https://example.com/test.jpg'}]
  }));
  assert.match(html,/md-product-card--image-focused md-product-card--hover-lift/);
  assert.match(html,/padding:10px/);
  assert.match(html,/border-radius:8px/);
  assert.match(html,/min-height:240px/);
  assert.match(html,/background-color:#ffffff/);
  assert.match(html,/border-color:#eaeaea/);
  assert.match(html,/border-width:2px/);
  assert.match(html,/box-shadow:0 1px 3px rgba\(15, 23, 42, 0.12\)/);
  assert.match(html,/height:175px/);
  assert.match(html,/object-fit:cover/);
  assert.match(html,/aspect-ratio:4\/3/);
});

test('reusable Choice renders record-backed modifier image, upgrade price and card styling', async () => {
  const definition = components.find(c => c.apiName === 'OneChoice');
  const built = await buildBundledComponent(definition);
  const context = {React,module:{exports:{}},Intl,Date,URL,crypto:globalThis.crypto};
  vm.runInNewContext(built.compiledJs,context);
  const html = renderToStaticMarkup(React.createElement(context.module.exports.default,{
    kind:'Choice',label:'Choose a side',mode:'radio',optionLayout:'cards',
    optionLabelFieldApiName:'Name',optionValueFieldApiName:'Id',
    optionPriceFieldApiName:'Upcharge',optionImageFieldApiName:'ImageUrl',
    optionImageHeight:72,optionImageFit:'cover',optionColumns:2,
    currencyCode:'GBP',records:[{
      Id:'fries',Name:'Large fries',Upcharge:0.5,
      ImageUrl:'https://example.com/fries.jpg'
    }]
  }));
  assert.match(html,/one-choice-options--cards/);
  assert.match(html,/one-choice-option--card/);
  assert.match(html,/Choose a side/);
  assert.match(html,/Large fries/);
  assert.match(html,/£0\.50/);
  assert.match(html,/one-choice-option__image/);
  assert.match(html,/object-fit:cover/);
  assert.match(html,/--one-choice-columns:2/);
});


test('reported One UI accessibility contracts remain implemented', async () => {
  const read = name => readFile(new URL('../src/one/' + name, import.meta.url), 'utf8');
  const [overlay, menu, tabs, button, input, search, form, grid, shared, board, timeline, chart, documentViewer, dashboardEmbed, conversation, cart, navigation] = await Promise.all([
    read('OneOverlay/OneOverlay.jsx'), read('OneMenu/OneMenu.jsx'),
    read('OneTabs/OneTabs.jsx'), read('OneButton/OneButton.jsx'),
    read('OneInput/OneInput.jsx'), read('OneSearch/OneSearch.jsx'),
    read('OneRecordForm/OneRecordForm.jsx'), read('OneItemGrid/OneItemGrid.jsx'), read('shared/accessibilityHooks.ts'), read('OneBoard/OneBoard.jsx'),
    read('OneTimeline/OneTimeline.jsx'), read('OneChart/OneChart.jsx'), read('OneDocumentViewer/OneDocumentViewer.jsx'),
    read('OneDashboardEmbed/OneDashboardEmbed.jsx'), read('OneConversation/OneConversation.jsx'), read('OneShoppingCart/OneShoppingCart.jsx'), read('OneNavigation/OneNavigation.jsx')
  ]);
  assert.match(overlay, /role="dialog" aria-modal="true"/);
  assert.match(shared, /event\.key === 'Escape'/);
  assert.match(overlay, /useModalAccessibility\(React,open,dialogRef,close\)/);
  assert.match(shared, /document\.addEventListener\('focusin'/);
  assert.match(menu, /event\.key === "ArrowDown"/);
  assert.match(menu, /event\.key === "Home"/);
  assert.match(menu, /useDismissOnOutside\(React,rootRef,open,dismiss\)/);
  assert.match(shared, /document\.addEventListener\('pointerdown'/);
  assert.match(tabs, /aria-controls=\{p\.showPanel!==false\?panelId:undefined\}/);
  assert.match(tabs, /aria-labelledby=\{activeTabId\}/);
  assert.match(button, /aria-busy=\{p\.loading===true\?"true":undefined\}/);
  assert.match(input, /"aria-invalid":p\.validationMessage\?"true":undefined/);
  assert.match(input, /className="one-error" role="alert"/);
  assert.match(search, /role="combobox"/);
  assert.match(search, /role="listbox"/);
  assert.match(search, /event\.key==="ArrowDown"/);
  assert.match(search, /event\.key==="Escape"/);
  assert.match(search, /event\.key==="Home"/);
  assert.match(form, /aria-invalid=\{error\?"true":undefined\}/);
  assert.match(form, /aria-describedby=\{error\?errorId:undefined\}/);
  assert.match(grid, /className="one-empty" role="status"/);
  assert.match(board, /role="region"/);
  assert.match(board, /<h3 className="one-heading">/);
  assert.match(board, /className="one-empty" role="status"/);
  assert.match(navigation, /className="one-empty" role="status"/);
  for (const component of [grid,timeline,chart,documentViewer,dashboardEmbed,conversation,cart]) assert.match(component, /className="one-empty" role="status"/);
  for (const component of [grid,timeline,chart,documentViewer,dashboardEmbed,conversation,cart]) assert.doesNotMatch(component, /className="one-empty"(?!\s+role="status")/, "every empty state must announce its status");
  const properties = await readFile(new URL("../src/core/builders/ComponentProperties/componentPropertiesView.tsx", import.meta.url), "utf8");
  for (const section of ["Content", "Layout", "Responsive", "Appearance"]) assert.match(properties, /propertySectionFor\(key, definitionsByKey\.get\(key\)\) === section/);
});


test('accessibility smoke covers login and supports configured published-page/dialog scans', async () => {
  const smoke = await readFile(new URL('../../../scripts/accessibility-smoke.mjs', import.meta.url), 'utf8');
  assert.match(smoke, /new URL\('\/login', base\)\.href/);
  assert.match(smoke, /component-fixture/);
  assert.match(smoke, /UI_SMOKE_PUBLISHED_URL/);
  assert.match(smoke, /UI_SMOKE_OVERLAY_SELECTOR/);
  assert.match(smoke, /window\.axe\.run/);
  assert.match(smoke, /showcase tab/);
  assert.match(smoke, /Critical\/serious WCAG violations/);
  const fixture = await readFile(new URL('./accessibility-fixture.jsx', import.meta.url), 'utf8');
  for (const component of ['OneTable', 'OneInput', 'OneButton', 'OneOverlay']) assert.match(fixture, new RegExp(component));
});
