# MD-03.6 — Tenant lifecycle controls

## Baseline and implementation
This document records the implementation baseline following MD-03.1, MD-03.4 and MD-03.5. The original 3.6 roadmap definition was not found in the repository, so archival/retention/deletion are **proposed scope**, not previously approved functionality.

Existing platform-only operations: tenant creation/list/edit, suspension/reactivation, persisted state, and revocation of refresh sessions on suspension. Tenant hostname authentication is governed by verified tenant-domain bindings. Do not duplicate these mechanisms.

## Delivered in this change
The tenant management console requires a platform operator to enter the immutable tenant ID exactly before POST /platform/tenants/:tenantId/suspend or /reactivate. Cancelled or mismatched input does not submit the request. Server-side platform authorization, tenant status and session revocation remain authoritative; the browser confirmation is an additional accidental-action safeguard, not an authorization mechanism.

## Required for full lifecycle acceptance
- Archival: define tenant ARCHIVED semantics, inactivity/access rules, data retention and reversible restore before implementing.
- Retention: explicit per-tenant/legal-hold policy, audited approval, backup retention interactions and recoverability; never infer deletion from suspension.
- Erasure: separately authorized, asynchronous and idempotent job with exact tenant scoping, dry-run inventory, audit receipts, recovery window and staging proofs. No implicit database DROP, bulk delete, or production migration.
- Operational safety: non-platform callers must never invoke lifecycle endpoints. A suspended tenant's bearer/refresh/login paths must remain blocked. Reactivation must not revive revoked sessions.
- Verification: run web build, HTTP lifecycle smoke tests, and Aiven PostgreSQL integration against isolated test databases. Record passing evidence before merge and verify deployed production separately.

## Rollout constraints
The Aiven oneengine production service is shared across tenants. Tenant lifecycle actions must never modify unrelated tenant records. This change performs no production database writes or schema migrations.
