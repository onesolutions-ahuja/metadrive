# MetaDrive tenant seeders

**Core:** `src/seeders/core.mjs` consumes the existing canonical Core defaults (Objects,
Fields, Relationships, OneEngine access metadata and core page definitions).
A fresh tenant is created from metadata **without copying user accounts, tokens,
credentials, sessions or customer records**.

**Apps:** `src/seeders/apps.mjs` uses the existing AppExchange catalog and installer.
It seeds only a named installed app. Its declared page components, bindings, properties,
flows, objects, navigation and actions come from the existing app package.
No metadata package should contain customer transactions.

**Registry:** `src/seeders/registry.mjs` exposes independent Core and app entry
points and supports idempotent Core updates.

The existing live AppExchange and tenant-bootstrap routes remain the authority.
The registry does **not** bypass SQL installation, entitlements, licensing, RBAC,
tenant isolation or uninstall data-retention policy.

**Disaster recovery:** Seeders recreate clean metadata, not historical customer
records. Actual SQL loss requires tested encrypted PostgreSQL backups, point-in-time
recovery and restore verification. Never replace a failed populated database with
an empty seed automatically.

## Agent 2 integration contract (non-destructive)

- The current Core merge adds previously unknown Object/Page/Flow definitions by
  stable `apiName`, skips duplicates and preserves tenant-owned definitions and
  previously edited OneEngine grants. It is **not** a substitute for SQL
  repository persistence; live runtime activation needs an integration change.
- The additive `sql/tenant-seed-package-versions-v1.sql` ledger uses
  `(tenant_id, package_kind, package_key)` as its stable package identity.
  Package kinds are `core`, `shared`, and `app`. A successful package
  application must validate the SHA-256 definition checksum and update version
  state in the **same SQL transaction** as metadata changes. Failed and
  partially applied packages must not advance the ledger.
- Store stable searchable identifiers, ownership, relationships, version,
  publish state, and tenancy in SQL columns. Validated JSONB is permitted only
  for flexible component property bags and layout/style/event/binding values.
  Do not introduce a second active JSON snapshot store.
- **Agent 5 handoff:** keep AppExchange package manifest/catalog ownership.
  The installer should invoke the requested app seeder only after licence,
  entitlement, activation and dependency checks, and revoke executable
  routes/flows/jobs on deactivation while preserving customer records.
  The package catalog must supply a stable package key, version and checksum.
- **Core/OneEngine handoff:** fresh provisioned tenant-developer policy grants
  and separately scoped platform-developer grants must flow through the
  existing security engine and SQL metadata repository. Do not infer platform
  privileges from email address, and never replay initial grants over modified
  administrator permissions.
- Existing SQL migrations are not automatically safe to execute on production.
  Test against a disposable restored database, with a verified backup and
  explicit migration rollback plan before any runtime cutover.

## Verification

`node --test apps/server/test/agent2-core-seeder.test.mjs`

The SQL ledger DDL is additive and is **not** wired to the live installation
path in this branch. Migration execution and idempotency against an isolated
PostgreSQL test database remain required prior to activation.

## Transactional package version API

`src/seeders/registry.mjs` exports `packageChecksum`,
`assertSeedIdentity`, and `applyVersionedSeed(client, options)`.
The caller **must** already hold an open SQL transaction and have completed
app installation, licensing, entitlement, tenant and OneEngine checks. Pass
`{tenantId, kind, key, version, definition, apply}`, where `apply(client,
definition)` performs all metadata writes on the SAME transaction client.
Commit only after this function resolves successfully. Roll back on failure.
Never invoke it as a standalone connection or mark a package installed merely
because a catalog entry exists. Identical version and checksum skip safely;
reusing a version for changed metadata fails closed. Do not use it for tenant
business records or automatic permission resets.

Integration with the live SQL metadata repository and AppExchange transaction
owner remains a separate agent handoff. This module does not run during startup
unless explicitly invoked by the existing installer.

## SQL-only table cleanup

Do not infer that a SQL table is unused because a frontend file does not mention its name. Pages, published Flows and app modules call shared APIs; active physical Object tables are registered in `md_v2_object_registry` and cannot be removed by inspecting source literals alone.

Run `node apps/server/scripts/audit-sql-table-lifecycle.mjs` with the verified SQL-only database configured to inspect all active SQL tables, their metadata Object ownership, app references and seeder imports. This is read-only. Seeder packages are applied through the single `src/seeders/registry.mjs` implementation and the existing AppExchange installation path. Do not install seeders from standalone scripts or duplicate schema definitions.

The separate `remove-verified-sql-duplicates.mjs` operation is deliberately restricted to two identical historical backup copies; it requires an independently restored current encrypted backup proof, repeatable SQL state verification and a second checksum match under SQL locks before dropping anything. It is not a general-purpose table deletion mechanism. Never delete login, RBAC, tenant, published metadata, physical Object, history or archive tables just because a table has zero rows. Cleanup of older relational staging schemas requires a coordinated compatibility-removal migration, not a manual production `DROP`.
