// Workspace responsive regression contract for the audited Flow Builder and Setup shell.
// Uses the real consolidated stylesheet and representative production class names; screenshots
// are CI artifacts at the three widths required by the 2026-10-23 UI audit.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const cssPath = new URL('../apps/web/src/core/workspace/WorkspaceTheme/styles.css', import.meta.url);
const css = readFileSync(cssPath, 'utf8').replace(/^@import[^;]+;\s*/, '');
mkdirSync('artifacts', { recursive: true });

const markup = `<!doctype html>
<html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><div class="lightning">
  <header class="salesforce-header">
    <button class="icon-button" aria-label="Open apps">▦</button>
    <div class="brand"><span class="brand-cloud">M</span><strong>MetaDrive</strong></div>
    <div class="header-searches"><button class="global-record-search" aria-label="Search records"><span>Search records…</span></button></div>
    <div class="header-tools"><button class="icon-button profile-menu-wrap" aria-label="Profile">U</button></div>
  </header>
  <nav class="app-strip"><strong class="app-title">Setup</strong><div class="primary-tabs"><button class="primary-tab active">Home</button><button class="primary-tab">Objects</button><button class="primary-tab">Flows</button></div></nav>
  <div class="setup-layout">
    <aside class="setup-sidebar"><div class="quick-find"><div class="quick-find-title">Quick Find</div><div class="quick-find-input"><input aria-label="Quick Find" value=""></div></div>
      <div class="setup-tree"><button class="tree-item selected"><span>Flows</span></button><button class="tree-item"><span>Objects</span></button></div>
    </aside>
    <main class="workspace"><section class="flow-builder">
      <div class="flow-workarea">
        <aside class="flow-toolbox"><div class="toolbox-heading"><h2>Elements</h2></div><div class="toolbox-tabs">Elements</div><div class="toolbox-group"><h3>Logic</h3><button class="flow-element-option"><span>◇</span> Decision</button></div></aside>
        <div class="flow-canvas" style="min-width:0;min-height:420px;padding:20px"><h1>Flow Builder</h1><div class="surface" style="padding:20px">Start → Get Records → End</div></div>
        <aside class="flow-settings"><div class="settings-header"><h2>Set Up</h2></div><label>Label<input value="Get Records"></label><button class="btn btn-brand">Done</button></aside>
      </div>
    </section></main>
  </div>
</div></body></html>`;

const browser = await chromium.launch({ headless: true });
try {
  for (const { width, height } of [
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1024, height: 768 }
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.setContent(markup, { waitUntil: 'domcontentloaded' });
    await page.addStyleTag({ content: css });
    if (width >= 601) {
      await page.locator('.setup-sidebar').evaluate(element => element.classList.add('setup-sidebar-collapsed'));
    }
    if (width >= 821) {
      await page.locator('.flow-workarea').evaluate(element => element.classList.add('flow-toolbox-collapsed'));
    }
    await page.evaluate(() => document.fonts.ready);
    const metrics = await page.evaluate(() => {
      const box = selector => {
        const element = document.querySelector(selector);
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, display: style.display, position: style.position, gridColumns: style.gridTemplateColumns };
      };
      return {
        viewportWidth: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        header: box('.salesforce-header'),
        setupSidebar: box('.setup-sidebar'),
        flowWorkarea: box('.flow-workarea'),
        flowToolbox: box('.flow-toolbox'),
        flowSettings: box('.flow-settings')
      };
    });
    assert.ok(metrics.documentWidth <= width + 2,
      'Workspace overflows horizontally at ' + width + 'px: ' + JSON.stringify(metrics));
    assert.ok(metrics.header.height <= 56,
      'Header must remain at most 56px tall at ' + width + 'px: ' + JSON.stringify(metrics.header));
    assert.notEqual(metrics.flowSettings.display, 'none',
      'Flow settings must remain available at ' + width + 'px: ' + JSON.stringify(metrics.flowSettings));
    if (width <= 820) {
      assert.match(metrics.flowWorkarea.gridColumns, /^\d+(?:\.\d+)?px$|^minmax\(0px, 1fr\)$/,
        'Narrow Flow Builder should use one column at ' + width + 'px: ' + JSON.stringify(metrics.flowWorkarea));
      assert.equal(metrics.flowSettings.position, 'static',
        'Narrow Flow settings should stack in document flow at ' + width + 'px');
    } else {
      assert.match(metrics.flowWorkarea.gridColumns, /^56px/,
        'Tablet Flow Builder should preserve the 56px toolbox rail at ' + width + 'px: ' + JSON.stringify(metrics.flowWorkarea));
      assert.equal(metrics.flowSettings.position, 'absolute',
        'Tablet inspector should overlay rather than squeeze the canvas at ' + width + 'px');
    }
    assert.ok(metrics.setupSidebar.width >= (width <= 600 ? width - 2 : 55),
      'Setup navigation must remain usable at ' + width + 'px: ' + JSON.stringify(metrics.setupSidebar));
    await page.screenshot({ path: 'artifacts/workspace-flow-builder-' + width + '.png', fullPage: true });
    console.log('Workspace responsive smoke passed at ' + width + 'px', JSON.stringify(metrics));
    await page.close();
  }
} finally {
  await browser.close();
}
