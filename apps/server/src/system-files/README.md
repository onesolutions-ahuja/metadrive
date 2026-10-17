# SQL-only MetaDrive system runtime

The active server uses `apps/server/src/system-files/entrypoint.ts` and
`system-files/server.ts`. It does **not** import the removed legacy state
modules, seeders or JSON snapshot files.

**Database contract:** `schema.sql` creates fresh relational `md_*` tables
for tenants, identities, tenant domains, sessions, RBAC, metadata, typed records,
flow definitions and applications. Data values use SQL columns, not JSON/JSONB.
Never execute this schema as an automatic production migration: it does not
import or adapt pre-existing MetaDrive SQL metadata.

**Commands:** `npm run build --workspace apps/server`,
`npm run test:system --workspace apps/server`, `npm run check`.

**Not yet feature parity:** existing Aiven data migration, MFA, field/record
sharing policies, full Flow executor, metadata publishing/versioning, component
client rendering, builder endpoint parity and installation migrations are not
implemented. Existing app installations are not automatically recreated.

The branch must remain unmerged/undeployed until a non-destructive SQL
migration, complete security checks, end-to-end login, builders, CRUD, and flow
checks pass. Compiling the isolated service does not prove production readiness.
