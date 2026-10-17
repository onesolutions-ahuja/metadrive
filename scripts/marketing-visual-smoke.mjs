// Public-site browser smoke; authenticated tenant surfaces require a test tenant.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const base = process.env.UI_SMOKE_URL || 'http://127.0.0.1:4173/';
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch(base);
    if (response.ok) break;
  } catch {}
  if (attempt === 59) throw new Error('Vite marketing preview not available: ' + base);
  await new Promise(resolve => setTimeout(resolve, 300));
}
mkdirSync('artifacts', { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [375, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('.une-marketing').count(), 1, 'Marketing root missing');
    const metrics = await page.evaluate(() => {
      const ui = document.querySelector('.une-marketing');
      const rootStyle = getComputedStyle(document.documentElement);
      const visibleActions = [...ui.querySelectorAll('.une-button')]
        .filter(element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      return {
        rootWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        primary: rootStyle.getPropertyValue('--md-primary').trim(),
        minActionHeight: Math.min(...visibleActions.map(element => element.getBoundingClientRect().height)),
        actionsCount: visibleActions.length
      };
    });
    assert.equal(metrics.primary, '#1d4ed8', 'Shared platform brand token not loaded');
    assert.ok(metrics.rootWidth <= metrics.viewportWidth + 2,
      'Horizontal page overflow at ' + width + 'px: ' + JSON.stringify(metrics));
    assert.ok(metrics.actionsCount > 0, 'No actionable CTA at width ' + width);
    assert.ok(metrics.minActionHeight >= 44,
      'Undersized CTA at ' + width + 'px: ' + JSON.stringify(metrics));
    assert.deepEqual(errors, [], 'Browser runtime error at ' + width + 'px');
    await page.screenshot({ path: 'artifacts/marketing-' + width + '.png', fullPage: true });
    console.log('Marketing visual smoke passed at ' + width + 'px', metrics);
    await page.close();
  }
} finally {
  await browser.close();
}
