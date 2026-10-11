import { chromium, devices } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.METADRIVE_BASE_URL || 'https://onesolutions-ahuja.github.io/metadrive/';
const email = process.env.METADRIVE_TEST_EMAIL;
const password = process.env.METADRIVE_TEST_PASSWORD;
const routes = [
  ['Dashboard', 'une/apps/Records/home'],
  ['Object Manager', 'une/setup/object-manager'],
  ['Flow Builder', 'une/setup/flows'],
  ['Page Builder', 'une/setup/pages'],
  ['Settings', 'une/setup/settings']
];
const profiles = [
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['tablet', { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true }],
  ['mobile', { ...devices['iPhone 13'], browserName: undefined }]
];
await fs.mkdir('audit-results/screenshots', { recursive: true });
const report = { createdAt: new Date().toISOString(), base, profiles: [], limitations: [] };
const browser = await chromium.launch({ headless: true });

try {
  for (const [name, settings] of profiles) {
    const { browserName: ignored, ...contextSettings } = settings;
    const context = await browser.newContext(contextSettings);
    const page = await context.newPage();
    const issues = [];
    const results = [];
    page.on('pageerror', error => issues.push({ type: 'javascript', message: error.message.slice(0, 300) }));
    page.on('response', response => {
      if (response.status() >= 500) issues.push({ type: 'http_5xx', status: response.status(), url: response.url().split('?')[0] });
    });
    async function inspect(label, url) {
      const started = Date.now();
      try {
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
        await page.locator('body').waitFor({ state: 'visible' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        const safe = label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        await page.screenshot({ path: path.join('audit-results/screenshots', name + '-' + safe + '.png'), fullPage: true, animations: 'disabled' });
        const layout = await page.evaluate(() => {
          const root = document.documentElement;
          const overflowing = [...document.querySelectorAll('body *')].filter(el => {
            const s = getComputedStyle(el);
            if (s.visibility === 'hidden' || s.display === 'none') return false;
            const r = el.getBoundingClientRect();
            return r.width > 1 && r.right > innerWidth + 3 && s.position !== 'fixed';
          }).slice(0, 15).map(el => ({ tag: el.tagName, label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 45) }));
          return { horizontalOverflowPx: Math.max(0, root.scrollWidth - innerWidth), clippedCandidates: overflowing };
        });
        const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        results.push({ page: label, status: response?.status() ?? null, elapsedMs: Date.now() - started, layout, accessibility: { violations: accessibility.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length })) } });
      } catch (e) { results.push({ page: label, error: String(e).slice(0, 500) }); }
    }
    await inspect('Login', base);
    if (email && password) {
      try {
        await page.locator('input[type="email"]').first().fill(email);
        await page.locator('input[type="password"]').first().fill(password);
        await page.getByRole('button', { name: /^sign in$/i }).click();
        await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 });
        for (const [label, route] of routes) await inspect(label, new URL(route, base).href);
      } catch (e) { issues.push({ type: 'authentication', message: String(e).slice(0, 350) }); }
    } else issues.push({ type: 'skipped', message: 'Authenticated audit skipped: test-account secrets are missing.' });
    report.profiles.push({ name, results, issues });
    await context.close();
  }
} finally {
  await browser.close();
}
report.limitations.push('Safe read-only checks only: no save, delete, workflow execution or database writes.');
report.limitations.push('Screenshots are diagnostic captures, not visual regressions until approved baselines exist.');
report.limitations.push('Lighthouse synthetic performance cannot measure real-user INP.');
await fs.writeFile('audit-results/report.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ profiles: report.profiles.map(p => ({ name: p.name, pages: p.results.length, errors: p.issues.length })) }, null, 2));
