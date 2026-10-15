# MetaDrive tenant seeders and disaster recovery

## Separate concerns

- **Core definitions:** `apps/server/data/platform-metadata.json` and platform-scoped shared component manifest entries. These are *templates*, not a command to provision every business object for each new tenant.
- **Installable app definitions:** `apps/server/data/installable-app-packages.json`. The shared AppExchange installer is the single source of app metadata, install records, RBAC, flows, pages, layouts, navigation, and component templates. `src/seeders/tenant-seeders.mjs` exposes per-app lazy lookup and tenant-scoped seeding without copying those definitions.
- **Tenant configuration and installed apps:** are authoritative in PostgreSQL. Do not seed optional apps to tenants lacking an installation record. App licensing and server-side OneEngine RBAC remain separate checks.

## Fresh-tenant lifecycle

1. Create an isolated SQL tenant and authorized initial administrator using existing tenant APIs, SQL transactional writes, and OneEngine RBAC lifecycle. Do not copy another tenant's users.
2. Resolve Core definition templates. Provision only essential generic runtime definitions; do not eagerly activate Dashboard, Reports, Till, POS, or Kiosk.
3. When AppExchange installs an app, persist its tenant installation record, verify dependencies/entitlements and permissions, then invoke the existing idempotent `applyInstallableAppPackages` lifecycle. The `seedInstalledTenantApp(tenant, tenantId, appKey)` entry point can apply **only one** installed app while retaining tenant customizations. Commit the returned state using the current SQL persistence transaction, not by writing JSON to production.
4. Validate navigation and runtime module loading for the installed tenant. Uninstalled apps remain uninitialized and inaccessible.

## Data loss is different from fresh initialization

Seeders **do not recover** customer records, payments, transactions, user identities, session revocations, secrets, credentials, or sequence counters. If PostgreSQL is lost, recover those from tested, encrypted, point-in-time PostgreSQL backups and restore logs; then run versioned metadata migrations. Do not reset sequence counters or overwrite recovered customer metadata using starter templates.

## Future package additions

Add one declarative AppExchange package entry for each new optional module, with stable `appKey`, dependencies, object/field metadata, action/flow metadata, pages and component properties, default navigation, permissions and upgrade rules. Do not add an app-specific renderer to Core. Keep a single authoritative package definition; the lazy seeder registry filters the catalog by `appKey`.

## Current boundary

This change exposes isolated seeder entry points and enforces the AppExchange installation prerequisite. It does not replace the established tenant creation API or introduce an alternate install/SQL-write system. AppExchange's existing install lifecycle remains canonical.
