# MD-09 Phase 6B — Tenant route aliases

Additive, tenant-scoped SQL metadata; canonical URLs, app assignments and page actions remain unchanged.

Migration: apps/server/sql/route-aliases-v1.sql. Apply against production ONLY after a fresh restorable backup, successful isolated restore, schema diff review and approval. No automatic migration or JSONB fallback. If schema is absent, alias endpoints fail closed with HTTP 503; canonical URLs still work.

Aliases use app + lowercase slug + typed destination (App Home, App Page, Record List) + status + integer version. A bookmark at /une/apps/:appId/routes/:slug resolves through authenticated tenant metadata and current app, object, tab and page permissions. Missing, draft, reassigned or disabled targets fail closed. No arbitrary external redirect.

Alias writes require metadata:write or pages:manage. Each revision is atomic and audited to the SQL history table. Delete means disable, not destructive removal. Reader requires metadata:read and its application visibility grant. JWT tenant ID, not client input, scopes every SQL query.

No foreign key to metadrive_rel_tenants is declared because the current repository still supports legacy JSONB and normalized/typed persistence modes; the resolver always checks membership in the current authorized tenant state.

Premerge: production build, startup, dependency checks, schema validation, existing CI, SQL version/tenant isolation regression, desktop/mobile Chromium. Never deploy this feature branch before all tests pass.

Rollback: restore the previous application build; do not drop alias tables or mutate canonical app/page records. Table cleanup, if ever approved, requires exporting revision history first.
