import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';

const url = process.env.METADRIVE_URL || 'https://onesolutions-ahuja.github.io/metadrive/';
const pages = (process.env.METADRIVE_PAGE_PATHS || '/').split(',').map(x => x.trim()).filter(Boolean);
const repetitions = Number(process.env.METADRIVE_REPETITIONS || 5);
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const path of pages) {
    for (let run = 1; run <= repetitions; run++) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      const page = await context.newPage();
      const requests = [];
      page.on('response', async response => {
        const request = response.request();
        if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
          const timing = request.timing();
          requests.push({ url: response.url().replace(/([?&](?:token|key|secret|password)=)[^&]+/gi, '$1[REDACTED]'), status: response.status(), durationMs: timing.responseEnd >= 0 ? Math.round(timing.responseEnd) : null });
        }
      });
      const started = performance.now();
      const target = new URL(path.replace(/^\//, ''), url.endsWith('/') ? url : url + '/').toString();
      try {
        const response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
        const domContentLoadedMs = Math.round(performance.now() - started);
        await page.locator('#root').waitFor({ state: 'visible', timeout: 15000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
        const settledMs = Math.round(performance.now() - started);
        const metrics = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          const paints = performance.getEntriesByType('paint');
          return { ttfbMs: Math.round(nav?.responseStart || 0), firstContentfulPaintMs: Math.round(paints.find(x => x.name === 'first-contentful-paint')?.startTime || 0), transferBytes: nav?.transferSize || 0 };
        });
        results.push({ path, run, status: response?.status(), domContentLoadedMs, settledMs, ...metrics, slowApiRequests: requests.filter(x => x.durationMs > 500).sort((a,b) => b.durationMs - a.durationMs) });
      } catch (error) {
        results.push({ path, run, error: String(error), elapsedMs: Math.round(performance.now() - started) });
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
await mkdir('performance-results', { recursive: true });
await writeFile('performance-results/pages.json', JSON.stringify({ url, measuredAt: new Date().toISOString(), results }, null, 2));
for (const path of pages) {
  const rows = results.filter(x => x.path === path);
  const valid = rows.filter(x => Number.isFinite(x.settledMs));
  const mean = key => valid.length ? Math.round(valid.reduce((sum, x) => sum + x[key], 0) / valid.length) : 'N/A';
  console.log(JSON.stringify({ path, samples: rows.length, successful: valid.length, averageDomContentLoadedMs: mean('domContentLoadedMs'), averageSettledMs: mean('settledMs'), minSettledMs: valid.length ? Math.min(...valid.map(x => x.settledMs)) : 'N/A', maxSettledMs: valid.length ? Math.max(...valid.map(x => x.settledMs)) : 'N/A', errors: rows.filter(x => x.error).map(x => x.error) }));
}
