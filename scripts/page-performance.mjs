import { chromium } from 'playwright';

const base = 'https://onesolutions-ahuja.github.io/metadrive/';
const email = process.env.METADRIVE_TEST_EMAIL;
const password = process.env.METADRIVE_TEST_PASSWORD;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const results = [];
async function measure(name, url, readySelector) {
  const start = performance.now();
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.locator(readySelector).first().waitFor({ state: 'visible', timeout: 20000 });
    const domMs = Math.round(performance.now() - start);
    const networkStart = performance.now();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    results.push({ name, url, domMs, settledMs: Math.round(performance.now() - start), httpStatus: response?.status() });
  } catch (error) {
    results.push({ name, url, error: String(error).slice(0, 250) });
  }
}
await measure('Login', base, 'input[type="password"]');
if (email && password) {
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  const started = performance.now();
  await page.getByRole('button', { name: /^sign in$/i }).click();
  try {
    await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 30000 });
    results.push({ name: 'Login → dashboard', settledMs: Math.round(performance.now() - started) });
    const routes = [
      ['Dashboard', 'une/apps/Records/home'],
      ['Object Manager', 'une/setup/object-manager'],
      ['Flow Builder', 'une/setup/flows'],
      ['Page Builder', 'une/setup/pages'],
      ['Settings', 'une/setup/settings'],
      ['Records', 'une/apps/Records/home']
    ];
    for (const [name, route] of routes) {
      await measure(name, base + route, 'body');
    }
  } catch (error) {
    results.push({ name: 'Authenticated pages', error: 'Login did not complete: ' + String(error).slice(0, 200) });
  }
} else {
  results.push({ name: 'Authenticated pages', error: 'SKIPPED: METADRIVE_TEST_EMAIL and METADRIVE_TEST_PASSWORD secrets not configured' });
}
console.log(JSON.stringify(results, null, 2));
const fs = await import('node:fs');
fs.writeFileSync('page-performance.json', JSON.stringify(results, null, 2));
await browser.close();
