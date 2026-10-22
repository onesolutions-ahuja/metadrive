// Automated accessibility smoke for the public frontend surface.
// Authenticated tenant pages still require a configured test tenant to scan.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const base = process.env.UI_SMOKE_URL || 'http://127.0.0.1:4173/';
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(base);
    if (response.ok) break;
  } catch {}
  if (attempt === 59) throw new Error('Frontend preview not available: ' + base);
  await new Promise(resolve => setTimeout(resolve, 300));
}
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const results = await page.evaluate(async () => window.axe.run(
    document.querySelector('.une-marketing') || document.body,
    { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }
  ));
  const blocking = results.violations.filter(item => ['critical', 'serious'].includes(item.impact));
  if (results.violations.length) {
    console.log('axe-core violations:', JSON.stringify(results.violations.map(item => ({
      id: item.id, impact: item.impact, help: item.help, nodes: item.nodes.length
    })), null, 2));
  }
  assert.deepEqual(runtimeErrors, [], 'Frontend runtime errors during accessibility scan');
  assert.deepEqual(blocking, [], 'Critical/serious WCAG violations found by axe-core');
  console.log(`axe-core scan passed: ${results.passes.length} checks passed; ${results.violations.length} non-blocking violation types.`);
  await page.close();
} finally {
  await browser.close();
}
