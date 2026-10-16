# MetaDrive manual UI/UX audit

This audit checks the **live MetaDrive site**, without modifying the live app or database. It runs only on manually dispatched GitHub Actions jobs, never on push, pull request or schedule.

## Before running

Set repository secrets in **Settings → Secrets and variables → Actions**:

- METADRIVE_TEST_EMAIL
- METADRIVE_TEST_PASSWORD

Use a **dedicated test-only account in a seeded test tenant**. Do not use a production superadmin or an account with real customer records. GitHub workflow artifacts in a public repository should **not** be treated as private; screenshots mask inputs, tables, images and common record data but cannot guarantee full redaction of every tenant-specific field.

Open **Actions → MetaDrive full UI-UX audit (manual only) → Run workflow → main**. The optional baseline run ID allows comparison against screenshots from a previous approved run with the same device sizes and a stable seeded dataset. Omit it for the first approved baseline capture.

## Checks

- Six responsive layouts: desktop 1440×900, 15.6-inch till 1920×1080, tablet 820×1180, phone 390×844, phone landscape 844×390, reduced-width approximation for zoom.
- Authenticated login and 19 documented app/setup routes, plus up to three discovered record-list routes.
- HTTP 4xx/5xx, browser JavaScript errors, auth redirects and incomplete rendering.
- Horizontal overflow, potentially clipped or overlapping text, small touch targets, missing control labels, duplicate IDs and broken images.
- axe-core accessibility (WCAG 2.0, 2.1, 2.2 A/AA), ten keyboard tab stops, form/control inventory.
- Safe local Quick Find, profile dropdown and record-list Next/Previous when available; no saving, checkout, flow execution or destructive interaction.
- Synthetic page readiness, TTFB, FCP, LCP, CLS and Lighthouse login performance.
- Redacted screenshots and *optional* baseline pixel diff reports.

Artifacts: **report.json**, **summary.md**, **screenshots/**, **diffs/** (when a baseline is provided), and **lighthouse/**. Failed and skipped screens are explicit. A successful GitHub job is not a declaration of zero UX issues: inspect the summary and the report.

### Limitations

This is a **safe UI smoke/heuristic audit**, not a complete functional end-to-end test for all buttons. Write workflows (creating sales, saving a Flow, printing a receipt, payment processing) need a dedicated staging environment and synthetic fixtures. We intentionally do not perform those actions on live production. Visual snapshots are useful for diagnosing changes but require manual approval of the baseline and may flag dynamic content, fonts or timing. Headless Lighthouse timings differ from real devices; 200% equivalent is a narrow viewport, not actual browser zoom. Use real-device review for complex touch and kiosk journeys.
