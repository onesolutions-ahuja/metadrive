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
    assert.equal(html, fixture.html);
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
