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
