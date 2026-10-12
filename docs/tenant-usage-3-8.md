# MD-03.8 — Tenant usage, operational visibility and advisory limits

## Delivered

- **Platform tenant detail → Tenant usage:** on-demand count snapshot for the selected organisation, including user/active-user, object/custom-object, field, record, flow/published-flow, page, app, report, dashboard, Named Credential, pending approval and verified-domain counts.
- **Tenant Company Settings → Tenant usage:** an equivalent read-only snapshot for users authorised with tenant security management. The API itself permits the narrower `security:read` permission.
- `GET /api/platform/tenants/:tenantId/usage` requires the immutable `platform:superadmin` policy. It works for suspended and archived tenants without allowing login to those tenants.
- `GET /api/tenant/usage` requires a valid same-tenant session and effective `security:read` policy. It never accepts a client-supplied tenant ID.
- `PATCH /api/platform/tenants/:tenantId/usage-targets` is platform-only, validates 1–1,000,000,000 integral advisory targets for users, records, objects and flows; `null` clears an individual target. Settings persist in the tenant registry and are audited as `USAGE_TARGETS_UPDATED`.
- Exceeding a target creates a **visual warning only**. It does not reject requests, block users, disable Flows, apply a penalty, create charges or alter billing.
- Snapshots calculate from existing canonical per-tenant state. They are neither new metering infrastructure nor database queries that scan every tenant for each directory entry.
- No customer record content, credentials, identities, encrypted payloads, private event content, or raw audit entries are exposed. Counts are not byte estimates and `storageBytes` remains `null` until independently measured storage accounting exists.

## Safety and performance

The tenant directory remains paginated, using existing cheap registry data. Detailed counters are calculated only when a tenant is opened, explicitly refreshed, or requested by that tenant's authorised security users. No database migration or new paid service is required. This is compatible with Aiven JSONB, relational and SQL-only persistence: optional `usageTargets` is part of the existing registry schema.

The snapshot is current at `sampledAt`, not a real-time continuous stream or a historical usage/billing record. Warnings are advisory, not hard resource quotas. Avoid claiming storage, bandwidth or API rate limits without independently measured and enforced implementations.

## Acceptance tests

The standard server suite checks isolated counting, secret redaction, warning boundaries, empty legacy tenants, invalid inputs, platform-only writes, tenant-scoped reads, malformed target rejection, persistence across restart, and archived-tenant reporting. Compiled-runtime CI confirms the new `.mjs` module is bundled into `dist`.

**Operational verification:** CI passing and merge demonstrate repository readiness. The existing Render auto-deploy may ship the PR after merge; its live status should be verified separately. No new Aiven instance, Render service, or migration is needed.
