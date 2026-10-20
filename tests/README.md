# MetaDrive test suites

The five requested directories contain executable suite manifests. The canonical test sources remain under `apps/server/test/system/` and `apps/web/test/` so their imports, fixtures, existing CI and test discovery do not break or duplicate tests.

| Suite | Run | Coverage |
| --- | --- | --- |
| `unit/` | `npm run test:suite:unit` | Pure functions, field/property metadata, calculations and contracts |
| `integration/` | `npm run test:suite:integration` | Shared services, APIs, jobs, events and cross-engine contracts |
| `tenant-isolation/` | `npm run test:suite:tenant-isolation` | RBAC, identity, tenant scope and security contracts |
| `app-lifecycle/` | `npm run test:suite:app-lifecycle` | Package installation, seeding, licensing, updates and uninstall |
| `browser-e2e/` | `npm run test:suite:browser-e2e` | The existing real-browser SQL Builder/Flow smoke script; requires Playwright, a built runtime, migrated SQL test DB and `METADRIVE_SQL_TEST_DATABASE_URL` |

`scripts/run-test-suite.mjs` runs the listed canonical test paths with the current `tsx` test setup. Every test source is assigned to exactly one manifest among the first four categories; browser E2E uses the existing `apps/server/scripts/builder-browser-smoke.mjs`, not a simulated browser test. Suite taxonomy is for discovery and targeted regressions; it does **not** replace the authoritative `npm run check`, SQL smoke, full server system suite, frontend tests, or CI release workflows.

When adding or renaming a test, update its corresponding manifest and keep the legacy full-suite runner discovering it. Do not weaken tenant/RBAC coverage or move tests in bulk without repairing all relative imports, fixtures and CI paths. Individual tests can be physically relocated in a later import-safe PR, but such moves are not required to run the requested suite categories.
