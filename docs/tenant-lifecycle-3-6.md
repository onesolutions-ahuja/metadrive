# MD-03.6 — Tenant lifecycle management

## Implemented
- Platform-only suspend and reactivate, including tenant refresh-session revocation and bearer-token revocation epoch.
- Tenant ID confirmation in the platform administration UI for suspension, reactivation, archival and restoration.
- Server-enforced status transitions: ACTIVE → SUSPENDED → ARCHIVED → SUSPENDED → ACTIVE.
- Archived tenants deny authentication and tenant requests. Archived records, metadata, users and domains are retained.
- Archive and restore events are persisted in the platform tenant management audit; archive also revokes existing sessions.
- Audited, platform-only retention-until and legal-hold metadata. No automatic expiry or deletion.
- Platform directory archived-status filtering and summary metadata; archive/restore/retention UI.
- HTTP smoke regressions for denied cross-tenant/platform access, archived login denial, restore-to-suspended and legal-hold persistence.

## Deliberately prohibited
A destructive tenant purge is not exposed. A retention deadline is **not consent or authorization for deletion**. Physical erasure across tenant data, users, database backups and exported copies requires a separately authorised deletion ceremony, proof of recoverability and statutory/legal-hold constraints. No production writes or migrations are part of this PR.

## Acceptance
Merge only after CI build, server lifecycle HTTP tests and PostgreSQL staging tests pass. A merged PR is not production deployment proof; production rollout and explicit deletion-policy approval remain independent.
