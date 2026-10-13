import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultBase = 'https://unesolutions.co.uk/une/';
const base = new URL(process.env.METADRIVE_BASE_URL || defaultBase);
const email = process.env.METADRIVE_TEST_EMAIL;
const password = process.env.METADRIVE_TEST_PASSWORD;
const output = process.env.METADRIVE_AUDIT_OUTPUT || 'audit-results';
const baselineDir = process.env.METADRIVE_BASELINE_DIR || '';
const root = path.resolve(output);
const limits = { pageMs: 1500, touchTargetPx: 24, preferredTouchPx: 44 };
if (base.protocol !== 'https:' && base.hostname !== 'localhost') throw new Error('Use HTTPS or localhost');
if (process.env.METADRIVE_BASE_URL && base.origin !== new URL(defaultBase).origin &&
    process.env.METADRIVE_ALLOW_OTHER_HOST !== 'true') throw new Error('Non-default host requires explicit opt-in');
if (Boolean(email) !== Boolean(password)) throw new Error('Set both test email and password');
if (!email || !password) throw new Error('Authenticated full audit requires METADRIVE_TEST_EMAIL and METADRIVE_TEST_PASSWORD (GitHub Actions secrets).');
if (base.pathname.indexOf('/une/') !== 0 && base.hostname !== 'localhost') throw new Error('Unexpected UNE app base path');

const profiles = [
  { name: 'desktop', viewport: { width: 1440, height: 900 } },
  { name: 'till-15-inch', viewport: { width: 1920, height: 1080 }, hasTouch: true },
  { name: 'tablet', viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true },
  { name: 'phone', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { name: 'phone-landscape', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true },
  { name: 'zoom-equivalent', viewport: { width: 640, height: 800 } }
];
const routes = [
  ['Automation Settings','une/setup/automation-settings'],
  ['App home', 'une/apps/Records/home'],
  ['Setup home', 'une/setup/home'],
  ['Object Manager', 'une/setup/object-manager'],
  ['Flow Builder', 'une/setup/flow-builder'],
  ['Page Builder', 'une/setup/page-builder'],
  ['Kiosk Page Builder', 'une/setup/page-builder/UNE_KIOSK'],
  ['Dashboard Builder', 'une/setup/dashboard-builder'],
  ['Report Builder', 'une/setup/report-builder'],
  ['Component Library', 'une/setup/component-library'],
  ['App Manager', 'une/setup/app-manager'],
  ['AppExchange', 'une/setup/app-exchange'],
  ['Connector Settings', 'une/setup/connector-settings'],
  ['Named Credentials', 'une/setup/named-credentials'],
  ['Company Settings', 'une/setup/company-settings'],
  ['Access Control', 'une/setup/rbac'],
  ['Flow Interviews', 'une/setup/flow-interviews'],
  ['Scheduled Flows', 'une/setup/scheduled-flows'],
  ['Flow Logs', 'une/setup/flow-logs'],
  ['Approval Processes', 'une/setup/approval-processes']
];
const report = {
  startedAt: new Date().toISOString(), base: base.origin + base.pathname,
  mode: 'read-only', targetReadyMs: limits.pageMs, profiles: [],
  scope: { routes: routes.map(([name, route]) => ({ name, route })), devices: profiles.map(p => p.name) },
  summary: {}, limitations: [
    'Read-only inspection only. Checkout, saving, deleting, changing credentials, executing Flows and payments are never triggered.',
    'User interactions are limited to local Quick Find, profile menu and keyboard focus; arbitrary application buttons are not clicked.',
    '200%-zoom equivalent is a reduced CSS viewport, not actual browser zoom.',
    'Visual regression requires an approved, compatible baseline run; initial screenshots are reference candidates, not passes.',
    'Screenshots are redacted to conceal form and table data; use a dedicated test tenant, not real customer data.',
    'Lighthouse synthetic tests and browser timing do not measure real-user INP.',
    'Some UI and UX judgement (visual hierarchy and task comprehension) requires human review.'
  ]
};
const discovered = new Set();
const discoveredPages = new Set();
const maxDynamicRoutes = Number(process.env.METADRIVE_AUDIT_MAX_DYNAMIC || 150);
const severity = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const findIssue = (list, code, level, details) => {
  if (list.some(i => i.code === code && i.details === details)) return;
  list.push({ code, severity: level, details: String(details).slice(0, 360) });
};
function urlFor(relative) { const path = base.pathname.endsWith('/une/') && relative.startsWith('une/') ? relative.slice(4) : relative; return new URL(path, base).href; }
function safeName(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 70); }
async function mkdir(p) { await fs.mkdir(p, { recursive: true }); }
function isSameApp(url) {
  try {
    const u = new URL(url, base);
    return u.origin === base.origin && u.pathname.startsWith(base.pathname) &&
      !/\/auth\/|\/logout|\/delete|\/execute|\/payment|\/checkout/.test(u.pathname.toLowerCase());
  } catch { return false; }
}
async function capture(page, profile, label, findings) {
  const name = profile + '-' + safeName(label) + '.png';
  const folder = path.join(root, 'screenshots');
  await mkdir(folder);
  const file = path.join(folder, name);
  // Mask content-bearing regions before uploading artifacts from a public repository.
  const masks = page.locator('input, textarea, [contenteditable="true"], [data-sensitive], table tbody td, [role="gridcell"], img, .user-menu, [class*="customer-info"], [class*="record-row"]');
  await page.screenshot({ path: file, fullPage: true, animations: 'disabled',
    mask: [masks], maskColor: '#cccccc', timeout: 20000 });
  const comparison = { status: 'baseline-needed' };
  if (baselineDir) {
    const old = path.join(baselineDir, 'screenshots', name);
    try {
      const { PNG } = await import('pngjs');
      const pixelmatch = (await import('pixelmatch')).default;
      const previous = PNG.sync.read(await fs.readFile(old));
      const current = PNG.sync.read(await fs.readFile(file));
      if (previous.width !== current.width || previous.height !== current.height) {
        comparison.status = 'dimension-changed';
        comparison.previous = [previous.width, previous.height];
        comparison.current = [current.width, current.height];
        findIssue(findings, 'VISUAL_DIMENSIONS', 'medium', name);
      } else {
        const diff = new PNG({ width: current.width, height: current.height });
        const pixels = pixelmatch(previous.data, current.data, diff.data, current.width, current.height, { threshold: 0.12 });
        comparison.status = pixels / (current.width * current.height) > 0.01 ? 'changed' : 'matched';
        comparison.changedPercent = Math.round(pixels / (current.width * current.height) * 10000) / 100;
        if (comparison.status === 'changed') {
          await mkdir(path.join(root, 'diffs'));
          await fs.writeFile(path.join(root, 'diffs', name), PNG.sync.write(diff));
          findIssue(findings, 'VISUAL_REGRESSION', 'medium', name + ': ' + comparison.changedPercent + '% changed');
        }
      }
    } catch (e) {
      comparison.status = 'baseline-unavailable';
      comparison.reason = e.code === 'ENOENT' ? 'No matching approved baseline' : String(e.message).slice(0, 120);
    }
  }
  return { file: 'screenshots/' + name, comparison };
}
async function collectLayout(page) {
  return page.evaluate(() => {
    const visible = el => {
      const style = getComputedStyle(el), rect = el.getBoundingClientRect();
      return style.visibility === 'visible' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
    };
    const label = el => (el.getAttribute('aria-label') || el.getAttribute('title') ||
      el.textContent || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 55);
    const body = document.body, root = document.documentElement;
    const overflow = Math.max(0, root.scrollWidth, body.scrollWidth) - innerWidth;
    const clipped = [], cramped = [], unlabeled = [], duplicateIds = [];
    const typography = [], truncated = [], controlSizes = {};
    const ids = new Map();
    const leaves = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el)) continue;
      if (el.id) {
        ids.set(el.id, (ids.get(el.id) || 0) + 1);
      }
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      if (['H1','H2','H3','H4','P','LABEL'].includes(el.tagName) && typography.length < 200) {
        const fontSize = parseFloat(s.fontSize);
        typography.push({ kind: el.tagName, fontSize, weight: s.fontWeight,
          lineHeight: s.lineHeight, text: label(el) });
      }
      if (el.children.length === 0 && el.textContent.trim() &&
          el.scrollWidth > el.clientWidth + 5 && ['hidden','clip'].includes(s.overflowX) &&
          truncated.length < 15) truncated.push(label(el));
      if (['BUTTON','INPUT','SELECT','TEXTAREA'].includes(el.tagName)) {
        (controlSizes[el.tagName] ||= new Set()).add(Math.round(r.height));
      }
      if (r.left < -5 || r.right > innerWidth + 5) {
        if (r.width > 5 && r.height > 5 && !el.closest('[role="grid"], table, .flow-canvas, .page-builder-canvas')) {
          if (clipped.length < 12 && s.position !== 'fixed' && s.position !== 'absolute' &&
              !el.closest('[style*="overflow: auto"], [style*="overflow-x"]')) clipped.push({ tag: el.tagName, text: label(el) });
        }
      }
      if (['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.getAttribute('role') === 'button') {
        if (r.width < 24 || r.height < 24) {
          if (cramped.length < 12) cramped.push({ tag: el.tagName, text: label(el), size: [Math.round(r.width), Math.round(r.height)] });
        }
        if ((el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') &&
            !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.textContent.trim()) {
          if (unlabeled.length < 12) unlabeled.push(el.outerHTML.slice(0, 90));
        }
      }
      if (el.children.length === 0 && el.textContent.trim() && r.width > 4 && r.height > 4 &&
          s.position !== 'absolute' && s.position !== 'fixed' && leaves.length < 250) {
        leaves.push({ el, r, text: label(el) });
      }
    }
    for (const [id, count] of ids) if (count > 1 && duplicateIds.length < 10) duplicateIds.push({ id, count });
    const collisions = [];
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i], b = leaves[j];
        if (a.el.closest('button, a') && a.el.closest('button, a') === b.el.closest('button, a')) continue;
        const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
        const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (w > 8 && h > 8 && w * h > 0.35 * Math.min(a.r.width*a.r.height, b.r.width*b.r.height)) {
          if (collisions.length < 8) collisions.push([a.text, b.text]);
        }
      }
    }
    const header = document.querySelector('.salesforce-header');
    const sidebar = document.querySelector('.setup-sidebar');
    const shell = {
      headerPosition: header ? getComputedStyle(header).position : null,
      sidebarScrollable: !sidebar || sidebar.scrollHeight <= sidebar.clientHeight + 5 || ['auto','scroll'].includes(getComputedStyle(sidebar).overflowY),
      loadIndicator: document.querySelector('.navigation-load-time')?.textContent?.trim() || null,
      visibleTextLength: body.innerText.trim().length
    };
    const brokenImages = [...document.images].filter(img => visible(img) && img.complete && img.naturalWidth === 0)
      .slice(0, 10).map(img => (img.alt || img.src.split('/').pop() || '').slice(0, 70));
    const inViewport = [...document.querySelectorAll('input:not([type="hidden"]), button, a[href]')]
      .filter(visible).length;
    return { typography, truncated, controlSizeVariants: Object.fromEntries(
      Object.entries(controlSizes).map(([k,v]) => [k,[...v].filter(n => n > 0)])),
      viewport: [innerWidth, innerHeight], document: [root.scrollWidth, root.scrollHeight],
      overflowPx: Math.max(0, overflow), clipped, cramped, unlabeled, duplicateIds, collisions, brokenImages,
      interactiveVisible: inViewport, title: document.title, shell };
  });
}
async function inspectKeyboard(page) {
  const sequence = [];
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const focus = await page.evaluate(() => {
      const a = document.activeElement;
      if (!a || a === document.body) return null;
      const r = a.getBoundingClientRect();
      return { tag: a.tagName, label: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 50),
        offscreen: r.right < 0 || r.left > innerWidth || r.bottom < 0 || r.top > innerHeight };
    });
    if (focus) sequence.push(focus);
  }
  await page.keyboard.press('Escape');
  return sequence;
}
async function inspectInteractions(page, label) {
  const steps = [];
  // Never click arbitrary controls: their names may hide destructive workflow actions.
  if (label === 'Setup home' || label === 'Object Manager') {
    const quick = page.getByRole('textbox', { name: 'Quick Find' }).first();
    if (await quick.count() && await quick.isVisible()) {
      const before = await quick.inputValue();
      await quick.fill('audit-find-no-match');
      steps.push({ test: 'Quick Find text entry', result: await quick.inputValue() === 'audit-find-no-match' ? 'pass' : 'fail' });
      await quick.fill(before);
    } else steps.push({ test: 'Quick Find text entry', result: 'not-applicable' });
  }
  if (label.startsWith('Discovered record list')) {
    const next = page.getByRole('button', { name: /^next (page)?$/i }).first();
    if (await next.count() && await next.isVisible() && await next.isEnabled()) {
      // Pagination reads only. Never use New/Edit/Save/Export/Delete controls.
      const initialUrl = page.url();
      await next.click();
      steps.push({ test: 'List next-page navigation', result: 'pass',
        urlChanged: page.url() !== initialUrl });
      const previous = page.getByRole('button', { name: /^previous (page)?$/i }).first();
      if (await previous.count() && await previous.isVisible() && await previous.isEnabled()) {
        await previous.click();
        steps.push({ test: 'List previous-page navigation', result: 'pass' });
      }
    } else steps.push({ test: 'List pagination', result: 'not-applicable' });
  }
  if (label === 'Setup home') {
    const profile = page.getByRole('button', { name: 'User profile' }).first();
    if (await profile.count() && await profile.isVisible()) {
      await profile.click();
      const expanded = await profile.getAttribute('aria-expanded');
      steps.push({ test: 'Profile dropdown open', result: expanded === 'true' ? 'pass' : 'fail' });
      await profile.click();
    }
  }
  return steps;
}
async function inspectControlInventory(page) {
  // Inventory safe selectors and HTML state, without pressing submit/save/action buttons.
  return page.evaluate(() => {
    const visible = el => {
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const controls = [...document.querySelectorAll('input, select, textarea, button, [role="combobox"], [role="searchbox"], [role="tab"]')]
      .filter(visible);
    const byType = {};
    const noLabel = [];
    const invalidSelect = [];
    for (const el of controls) {
      const key = (el.getAttribute('role') || el.tagName.toLowerCase());
      byType[key] = (byType[key] || 0) + 1;
      const namedBy = el.getAttribute('aria-labelledby');
      const labelText = el.labels ? [...el.labels].map(l => l.textContent.trim()).join(' ') : '';
      const accessible = el.getAttribute('aria-label') || el.getAttribute('title') || labelText ||
        (namedBy && document.getElementById(namedBy)?.textContent) ||
        (el.tagName === 'BUTTON' ? el.textContent?.trim() : '') || '';
      if (!accessible && !el.placeholder && noLabel.length < 12) noLabel.push((el.outerHTML || '').slice(0, 110));
      if (el.tagName === 'SELECT' && el.options.length < 1 && invalidSelect.length < 10)
        invalidSelect.push(el.outerHTML.slice(0, 100));
    }
    const formValidation = [...document.forms].slice(0, 10).map(f => ({
      controls: f.elements.length,
      required: f.querySelectorAll('[required]').length,
      errorsPresent: f.querySelectorAll('[aria-invalid="true"], :invalid').length
    }));
    return { total: controls.length, byType, noLabel, emptySelects: invalidSelect,
      forms: formValidation, disabled: controls.filter(el => el.disabled).length };
  });
}
async function inspectLinks(page) {
  return page.evaluate(() => [...document.querySelectorAll('a[href]')].map(a => ({
    label: (a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 70),
    href: a.href
  })).filter(a => a.href).slice(0, 200));
}
async function run() {
  await mkdir(root);
  await mkdir(path.join(root, 'screenshots'));
  const browser = await chromium.launch({ headless: true });
  try {
    for (const profile of profiles) {
      const p = { name: profile.name, screens: [], errors: [], login: {}, coverage: {} };
      report.profiles.push(p);
      const context = await browser.newContext({ viewport: profile.viewport, hasTouch: !!profile.hasTouch,
        isMobile: !!profile.isMobile, reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        window.__auditLcp = 0;
        window.__auditCls = 0;
        try {
          new PerformanceObserver(list => { for (const e of list.getEntries()) window.__auditLcp = Math.round(e.startTime); })
            .observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver(list => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.__auditCls += e.value; })
            .observe({ type: 'layout-shift', buffered: true });
        } catch { /* Unsupported metric; leave as unavailable. */ }
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      let currentIssues = p.errors;
      page.on('pageerror', e => findIssue(currentIssues, 'JAVASCRIPT_ERROR', 'high', e.message));
      page.on('response', response => {
        if (response.status() >= 500) findIssue(currentIssues, 'HTTP_5XX', 'high', response.status() + ' ' + response.url().split('?')[0]);
        else if (response.status() === 404 && isSameApp(response.url())) {
          findIssue(currentIssues, 'HTTP_404', 'medium', response.url().split('?')[0]);
        }
      });
      async function scan(name, relative, authenticated = true) {
        const s = { name, route: relative, issues: [], checks: {}, status: 'started' };
        p.screens.push(s);
        currentIssues = s.issues;
        try {
          const started = performance.now();
          // Navigate through the SPA router rather than requesting deep links from the static host.
          // Static hosting can return HTTP 404 for a valid client-side route.
          const destination = urlFor(relative);
          await page.evaluate(target => {
            history.pushState({}, '', target);
            window.dispatchEvent(new PopStateEvent('popstate', { state: history.state }));
          }, destination);
          s.httpStatus = null;
          await page.waitForURL(destination, { timeout: 10000 });
          await page.waitForTimeout(350);
          const domMs = performance.now() - started;
          await page.locator('body').waitFor({ state: 'visible', timeout: 15000 });
          if (authenticated) {
            // An authenticated route returning a 200 login shell is not a pass.
            await page.waitForFunction(() => !document.querySelector('.auth-loading'), { timeout: 22000 });
            if (await page.locator('input[type="password"]').first().isVisible().catch(() => false))
              throw new Error('Authenticated route redirected to login');
          }
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(550);
          const readyMs = performance.now() - started;
          const timings = await page.evaluate(() => {
            const nav = performance.getEntriesByType('navigation')[0];
            const paint = performance.getEntriesByType('paint');
            return { ttfbMs: nav ? Math.round(nav.responseStart) : null,
              fcpMs: Math.round(paint.find(e => e.name === 'first-contentful-paint')?.startTime || 0) || null,
              lcpMs: window.__auditLcp || null, cls: Math.round((window.__auditCls || 0)*1000)/1000 };
          });
          s.timing = { domMs: Math.round(domMs), readyMs: Math.round(readyMs), ...timings };
          if (readyMs > limits.pageMs) findIssue(s.issues, 'SLOW_PAGE', 'medium', name + ': ' + Math.round(readyMs) + 'ms > ' + limits.pageMs + 'ms goal');
          if (s.httpStatus >= 400) findIssue(s.issues, 'PAGE_HTTP', 'high', 'HTTP ' + s.httpStatus);
          const appState = await page.evaluate(() => ({
            path: location.pathname,
            loginVisible: Boolean(document.querySelector('#login-email, input[type="password"]')),
            notFound: /(^|\\n)(404|page not found|route not found)(\\n|$)/i.test(document.body?.innerText || '')
          }));
          s.checks.appState = appState;
          if (appState.loginVisible || appState.notFound) {
            findIssue(s.issues, 'ROUTE_NOT_RENDERED', 'high', name + ': ' + appState.path);
            throw new Error('Client route did not render an authenticated page');
          }
          s.layout = await collectLayout(page);
          // Regression checks for the defects recorded in PRs #119, #121 and #123.
          // Read-only geometry checks; never click business actions or reveal field values.
          if (name === 'Component Library' || name === 'Page Builder' || name === 'Kiosk Page Builder') {
            s.checks.favouriteTargets = await page.locator('.component-favourite:visible').evaluateAll(nodes =>
              nodes.map(node => { const r = node.getBoundingClientRect(); return { width: r.width, height: r.height }; })
            );
            if (s.checks.favouriteTargets.some(r => r.width < limits.preferredTouchPx || r.height < limits.preferredTouchPx))
              findIssue(s.issues, 'FAVOURITE_TARGET_BELOW_44PX', 'medium', 'Visible favourite action is smaller than 44x44px');
          }
          if (name === 'Page Builder' || name === 'Kiosk Page Builder') {
            s.checks.builderToolbar = await page.locator('.builder-titlebar > .toolbar-actions:visible').evaluateAll(nodes =>
              nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right }; })
            );
            if (s.checks.builderToolbar.some(r => r.left < -3 || r.right > profile.viewport.width + 3))
              findIssue(s.issues, 'BUILDER_TOOLBAR_OFFSCREEN', 'high', 'Toolbar extends outside viewport');
          }
          if (name === 'Named Credentials') {
            s.checks.credentialsTable = await page.locator('.named-credentials-page .table-scroll:visible').evaluateAll(nodes =>
              nodes.map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }; })
            );
            if (s.checks.credentialsTable.some(r => r.left < -3 || r.right > profile.viewport.width + 3))
              findIssue(s.issues, 'CREDENTIALS_TABLE_OFFSCREEN', 'high', 'Table scroll container extends outside viewport');
          }
          if (s.layout.shell.headerPosition && !['fixed','sticky'].includes(s.layout.shell.headerPosition)) findIssue(s.issues,'HEADER_NOT_STICKY','medium','Header position: '+s.layout.shell.headerPosition);
          if (!s.layout.shell.sidebarScrollable) findIssue(s.issues,'SIDEBAR_CANNOT_SCROLL','high',name);
          if (s.layout.shell.visibleTextLength < 25) findIssue(s.issues,'BLANK_SCREEN_CANDIDATE','high',name);
          if (s.layout.shell.loadIndicator === 'Loading…') findIssue(s.issues,'LOADING_INDICATOR_PENDING','medium',name);
          if (s.layout.overflowPx > 3) findIssue(s.issues, 'HORIZONTAL_OVERFLOW', 'high', s.layout.overflowPx + 'px');
          if (s.layout.clipped.length) findIssue(s.issues, 'CLIPPED_ELEMENTS', 'medium', JSON.stringify(s.layout.clipped.slice(0, 4)));
          if (s.layout.collisions.length) findIssue(s.issues, 'TEXT_OVERLAP_CANDIDATES', 'medium', JSON.stringify(s.layout.collisions.slice(0, 4)));
          if (s.layout.cramped.length) findIssue(s.issues, 'SMALL_TOUCH_TARGETS', 'low', s.layout.cramped.length + ' examples');
          if (s.layout.unlabeled.length) findIssue(s.issues, 'UNLABELED_BUTTONS', 'medium', s.layout.unlabeled.length + ' examples');
          if (s.layout.duplicateIds.length) findIssue(s.issues, 'DUPLICATE_IDS', 'medium', JSON.stringify(s.layout.duplicateIds));
          if (s.layout.brokenImages.length) findIssue(s.issues, 'BROKEN_IMAGES', 'medium', JSON.stringify(s.layout.brokenImages));
          if (s.layout.truncated.length) findIssue(s.issues,'TRUNCATED_TEXT','medium',JSON.stringify(s.layout.truncated.slice(0,5)));
          const tiny = s.layout.typography.filter(t => t.fontSize < 12);
          if (tiny.length) findIssue(s.issues,'TINY_TEXT','medium',JSON.stringify(tiny.slice(0,5)));
          const inconsistent = Object.entries(s.layout.controlSizeVariants).filter(([,heights]) => heights.length > 6);
          if (inconsistent.length) findIssue(s.issues,'CONTROL_HEIGHT_VARIANCE','low',JSON.stringify(inconsistent));
          const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
          s.accessibility = accessibility.violations.map(v => ({ id: v.id, impact: v.impact, count: v.nodes.length,
            help: v.help, examples: v.nodes.slice(0, 3).map(n => n.target.join(' ')) }));
          for (const v of s.accessibility) findIssue(s.issues, 'A11Y_' + v.id, v.impact === 'critical' ? 'critical' : v.impact === 'serious' ? 'high' : 'medium', v.help + ' (' + v.count + ')');
          s.keyboard = await inspectKeyboard(page);
          if (s.keyboard.filter(f => f.offscreen).length > 2) findIssue(s.issues, 'OFFSCREEN_FOCUS', 'medium', 'Several tab stops are off screen');
          s.interactions = await inspectInteractions(page, name);
          for (const step of s.interactions) if (step.result === 'fail') findIssue(s.issues, 'INTERACTION_FAILED', 'medium', step.test);
          s.controlInventory = await inspectControlInventory(page);
          if (s.controlInventory.noLabel.length) findIssue(s.issues, 'POSSIBLE_UNLABELED_CONTROLS', 'low',
            s.controlInventory.noLabel.length + ' controls need review');
          if (s.controlInventory.emptySelects.length) findIssue(s.issues, 'EMPTY_DROPDOWNS', 'medium',
            s.controlInventory.emptySelects.length + ' selects have no options');
          s.links = (await inspectLinks(page)).filter(l => !isSameApp(l.href) && l.href.startsWith(base.origin)).slice(0, 15);
          if (s.links.length) findIssue(s.issues, 'BROKEN_INTERNAL_LINK_CANDIDATES', 'low', JSON.stringify(s.links.slice(0, 3)));
          for (const link of await inspectLinks(page)) if (isSameApp(link.href)) {
            if (/\/une\/o\/[^/]+\/list/.test(link.href)) discovered.add(link.href);
            discoveredPages.add(link.href);
          }
          s.screenshot = await capture(page, profile.name, name, s.issues);
          s.status = 'completed';
        } catch (e) {
          s.status = 'failed';
          findIssue(s.issues, 'SCREEN_EXCEPTION', 'high', String(e.message || e));
          try { s.screenshot = await capture(page, profile.name, name + '-error', s.issues); } catch { /* Report stays. */ }
        }
      }
      try {
        // Login once per browser context; never store credentials in logs or artifacts.
        const loginStart = performance.now();
        await page.goto(base.href, { waitUntil: 'domcontentloaded', timeout: 45000 });
        // A missing login form is a deployment or routing issue; fail fast rather than spending two minutes per viewport.
        await page.locator('#login-email, input[type="email"]').first().waitFor({ state: 'visible', timeout: 20000 });
        await page.locator('input[type="email"]').first().fill(email);
        await page.locator('input[type="password"]').first().fill(password);
        p.login.validation = await page.locator('form').first().evaluate(form => ({ valid: form.checkValidity() }));
        await page.getByRole('button', { name: /^sign in$/i }).click();
        await page.locator('input[type="password"]').first().waitFor({ state: 'hidden', timeout: 45000 });
        p.login.status = 'passed';
        p.login.elapsedMs = Math.round(performance.now() - loginStart);
        if (p.login.elapsedMs > limits.pageMs) findIssue(p.errors, 'SLOW_LOGIN', 'medium', p.login.elapsedMs + 'ms > 1500ms goal');
        for (const [name, relative] of routes) await scan(name, relative);
        const fixed = new Set(routes.map(([,r]) => urlFor(r)));
        const dynamic = [...new Set([...discovered,...discoveredPages])]
          .filter(u => !fixed.has(u)).slice(0,maxDynamicRoutes);
        for (let i = 0; i < dynamic.length; i++) {
          const url = new URL(dynamic[i]);
          await scan('Discovered page ' + (i+1), url.pathname.replace(base.pathname, '') + url.search);
        }
      } catch (e) {
        p.login.status = 'failed';
        try {
          p.login.diagnostic = await page.evaluate(() => ({
            pageTitle: document.title, urlPath: location.pathname,
            appLoading: Boolean(document.querySelector('.auth-loading')),
            loginFormVisible: Boolean(document.querySelector('#login-email')),
            visibleTextCharacters: document.body?.innerText?.length || 0
          }));
          p.login.screenshot = await capture(page, profile.name, 'login-error', p.errors);
        } catch { /* Preserve original failure without exposing page contents. */ }
        // Do not interpolate response bodies or form values; those may contain secrets.
        findIssue(p.errors, 'AUTHENTICATION_OR_NAVIGATION', 'critical', String(e.message || e).slice(0, 250));
      } finally {
        p.coverage = { requested: routes.length, completed: p.screens.filter(s => s.status === 'completed').length,
          failed: p.screens.filter(s => s.status === 'failed').length,
          skipped: routes.length - p.screens.filter(s => s.status === 'completed').length -
            p.screens.filter(s => s.status === 'failed' && routes.some(([name]) => name === s.name)).length };
        await context.close();
      }
    }
  } finally { await browser.close(); }
  const all = report.profiles.flatMap(p => [...p.errors, ...p.screens.flatMap(s => s.issues)]);
  report.finishedAt = new Date().toISOString();
  report.summary = { profiles: report.profiles.length, requestedScreens: profiles.length * routes.length,
    completedScreens: report.profiles.reduce((total, p) => total + p.coverage.completed, 0),
    failedScreens: report.profiles.reduce((total, p) => total + p.coverage.failed, 0),
    authenticatedProfiles: report.profiles.filter(p => p.login.status === 'passed').length,
    issues: all.length, bySeverity: Object.fromEntries(Object.keys(severity).map(key => [key, all.filter(e => e.severity === key).length])) };
  await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  const md = ['# MetaDrive UI/UX audit', '', 'Run: ' + report.startedAt, '',
    '| Metric | Result |', '|---|---:|',
    '| Authenticated device profiles | ' + report.summary.authenticatedProfiles + '/' + profiles.length + ' |',
    '| Screens completed | ' + report.summary.completedScreens + ' |',
    '| Screens failed | ' + report.summary.failedScreens + ' |',
    '| Findings | ' + all.length + ' |', '',
    '## Highest priority issues', ''];
  const ranked = report.profiles.flatMap(p => [
    ...p.errors.map(i => ({ profile: p.name, screen: 'Login', ...i })),
    ...p.screens.flatMap(s => s.issues.map(i => ({ profile: p.name, screen: s.name, ...i })))
  ]).sort((a,b)=>severity[b.severity]-severity[a.severity]);
  for (const i of ranked.slice(0, 70))
    md.push('- **' + i.severity.toUpperCase() + '** ' + i.profile + ' / ' + i.screen + ': ' + i.code + ' — ' + i.details.replace(/\|/g, '/') );
  md.push('', '## Limitations', ...report.limitations.map(l => '- ' + l), '');
  await fs.writeFile(path.join(root, 'summary.md'), md.join('\n'));
  console.log(JSON.stringify(report.summary, null, 2));
  // Audit closure is a hard gate. A green Actions run must not disguise severe UX defects.
  // Moderate findings (including contrast) require explicit review before declaring completion.
  const severe = all.filter(issue => ['critical', 'high'].includes(issue.severity));
  const unresolvedAcceptance = all.filter(issue =>
    issue.code === 'A11Y_color-contrast' ||
    ['FAVOURITE_TARGET_BELOW_44PX', 'BUILDER_TOOLBAR_OFFSCREEN',
      'CREDENTIALS_TABLE_OFFSCREEN', 'HORIZONTAL_OVERFLOW'].includes(issue.code));
  const coverageIncomplete = report.summary.authenticatedProfiles !== profiles.length ||
    report.summary.completedScreens < profiles.length * routes.length ||
    report.summary.failedScreens > 0;
  report.summary.closure = {
    status: !coverageIncomplete && severe.length === 0 && unresolvedAcceptance.length === 0 ? 'pass' : 'fail',
    coverageIncomplete, severeFindings: severe.length, unresolvedAcceptance: unresolvedAcceptance.length
  };
  // Rewrite the report with its final closure result (do not rely only on job success).
  await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2));
  await fs.appendFile(path.join(root, 'summary.md'),
    '\n## Acceptance gate\n\nStatus: **' + report.summary.closure.status.toUpperCase() +
    '**; severe findings: ' + severe.length + '; unresolved acceptance: ' +
    unresolvedAcceptance.length + '; coverage incomplete: ' + coverageIncomplete + '\n');
  if (report.summary.closure.status !== 'pass') process.exitCode = 2;
}
await run();
