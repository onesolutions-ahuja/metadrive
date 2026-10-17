# MetaDrive SQL-only backend

The active server entry is `apps/server/src/system-files/entrypoint.ts`. It uses
only PostgreSQL; no legacy snapshot or JSONB runtime is imported.

## Source structure

- `system-files/sql-persistence.ts`: SQL pool and transactions
- `system-files/object-definition.ts`: metadata and relationship definitions
- `system-files/authentication.ts`: hashed passwords and durable sessions
- `system-files/rbac-engine.ts`: grant/deny enforcement
- `system-files/record-engine.ts`: typed field validation, SQL record storage
- `system-files/component-runtime.ts`: registered component lookup
- `system-files/page-runtime.ts`: page/component SQL lookup
- `system-files/flow-runtime.ts`: active flow metadata and run tracking (executor not yet implemented)
- `system-files/app-runtime.ts`: licensed tenant installations
- `system-files/tenant-provisioning.ts`: tenant data creation

`system-files/schema.sql` defines **new** relational `md_*` tables, not a
migration of existing MetaDrive tables. It must not be applied automatically to
production or used to overwrite existing business records.

Use `npm run build --workspace apps/server` and
`npm run test:system --workspace apps/server` to validate the new backend.
Use `npm run check` for the repository-wide reference scan and build.

## Compatibility and release gate

This is a new runtime, **not a verified feature-parity replacement**. Before
deployment, migrate the approved existing SQL data and metadata, configure
tenant domains and permissions, implement the remaining Flow execution,
component rendering bindings, profile/field/record RBAC, app migrations and
frontend endpoint contracts, and test production authentication.

A successful compilation alone does not verify runtime compatibility or
authorization correctness. Old source modules have been removed from the PR
branch only. No production database changes have been made.
