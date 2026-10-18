# MetaDrive approved SQL Core

This directory contains **exactly fifteen approved Core files**. The architecture
contract and responsibilities are documented in `docs/server-code-organisation.md`.

The active HTTP server and entrypoint live under `../system-support/`. This is
an infrastructure boundary, not an alternative metadata, CRUD, RBAC or Flow engine.
Versioned additive SQL migrations also live under `../system-support/migrations/`;
the local `schema.sql` is for fresh installations, **not** an automatic
production replacement or migration of existing tenant data.

Other directories:
- `../app-seeders/`: independently versioned app metadata seeds
- `../../test/system/`: system regression tests
- `../../scripts/`: build and SQL smoke utilities

The shared Core provides SQL persistence, Object metadata, authentication, RBAC,
record CRUD, components, pages, flows, app lifecycle, tenant provisioning,
session metadata, platform tenant administration and generic system definitions.

Do not introduce parallel engines or hardcoded app logic. Before extending Core,
inspect and reuse the existing service. Keep tenant checks and server-side RBAC.
Run `npm run check` and the PostgreSQL SQL-smoke validation before merging.

**Known functional limits:** this restricted SQL runtime does not yet implement
all previously available Flow actions, advanced builders, tenant-admin routes,
record-sharing policies or complete metadata publishing/version rollback.
Passing CI does not demonstrate feature parity or end-to-end production readiness.
