# MD-03.7 — Verified Tenant Recovery Centre

## Recovery workflow implemented in repository

Tenant administrators can pre-enrol up to four independent email recovery contacts from Company Settings, with fresh enrolled TOTP. Each contact receives a cryptographically random private email verification token. Two **different** contacts must already be verified for at least seven days before a recovery request; the tenant must also retain a currently verified custom-domain DNS TXT proof.

A platform superadministrator with fresh TOTP may open a case for an **existing, active, same-tenant user**. The system privately notifies enrolled contacts with case-specific tokens. Two independent pre-enrolled contacts must verify the case. Any one contact can dispute and permanently block the case. Incomplete notification rejects the case; unsigned body flags such as `verified: true` cannot establish ownership.

Only after 24 hours may two distinct platform superadministrators approve with **fresh non-reusable MFA**, with checks against their current live platform policies at invitation time. The case requester cannot approve. Platform operators cannot retrieve invitation tokens. A 15-minute, SHA-256-digested, single-use invitation is delivered privately to a confirmed contact.

The named claimant (and nobody else) signs in with their own active tenant account and fresh MFA to redeem the invitation. Redemption atomically consumes the token and creates a one-hour restricted `tenant_admin_repair_only` grant in the separate control DB. Its subsequent single-use repair changes only that claimant's tenant RBAC administrator profile, revokes the claimant's sessions and requires a new login. The platform **never** obtains the user's password, a tenant token, Named Credentials or impersonation privileges.

Audit events are recorded in the dedicated platform-control database, protected from ordinary update/delete by a PostgreSQL trigger. The tenant's security audit records administrator restoration. This does not pretend that a database owner cannot alter audit data.

## Current production readiness (2026-10-12)

The independent Aiven control database and eight base tables exist. Its protected audit
trigger and restricted runtime role have **not** yet been installed with privileged
database access. The standard connected Aiven SQL editor disallows the relevant
`CREATE FUNCTION`, `GRANT` and `REVOKE` commands. An opt-in privileged migration
and post-migration runtime verification are provided in
`apps/server/scripts/provision-recovery-controls.mjs`.

Even when external integration flags are accidentally configured, the recovery API
now checks database identity, runtime role scope and the enabled immutable-event
trigger before each request and responds with HTTP 503 if any control is missing.
The user currently has **no SMTP provider**, so leave this service disabled. Existing
tenant creation, login, archival, domain, usage and normal RBAC features do not
depend on this optional recovery email transport.

See `docs/MD-03-PRODUCTION-VERIFICATION.md` for the checked production evidence.

## Security and activation requirements

The recovery routes remain **disabled by default**. Enable only after all requirements are present:

1. Provision a dedicated **database** on Aiven PostgreSQL `oneengine`, distinct from the tenant application database, with a dedicated least-privilege runtime account. It does not require another paid Aiven service; applying this SQL to the tenant application database is explicitly prohibited.
2. Apply `apps/server/sql/tenant-recovery-control.sql` to that dedicated database with a migration account. Restrict runtime roles; ensure control event triggers and tables are present.
3. Configure Render server secrets `METADRIVE_RECOVERY_ENABLED=true`, `METADRIVE_RECOVERY_DATABASE_URL`, `METADRIVE_RECOVERY_SMTP_URL` (authenticated smtp/smtps transport with mandatory TLS), and `METADRIVE_RECOVERY_FROM_EMAIL`. Do not expose them in web/frontend environment variables.
4. Verify actual private outbound email delivery, enrol two independent contacts at least seven days in advance, retain a verified custom domain TXT record, and ensure at least two distinct current platform superadministrators each have enrolled TOTP.
5. The intended recovery claimant must be an existing **active and MFA-enrolled tenant user**. If every tenant account is inaccessible, identity proof and a separately approved organisational rescue process are still required; **do not silently create or activate an administrator**.
6. Have an independent security operator verify DNS proof, invitation handling, audit access, contact disputes, case rollback and revocation under live Aiven/Render configuration before production launch. Test revoked operator, email takeover, duplicate approvals, cross-tenant claim, expiry, replay and concurrency.

No production database migration, SMTP credential installation, contact enrolment or successful production recovery is claimed from a GitHub merge.

## Testing

Standard server CI tests `tenant-recovery-policy`, `tenant-recovery-transaction`, `tenant-recovery-cases`, `tenant-recovery-verification`, `tenant-recovery-delivery` and `tenant-recovery-centre` security boundaries. The relational staging GitHub Actions workflow additionally creates an isolated disposable PostgreSQL database, applies the actual schema, tests dual approvals, private one-time invitation, tenant binding, atomic restricted grant, replay denial, OTP uniqueness and append-only events, then removes the disposable database.

## Safe operating procedure

Company Settings -> Tenant Emergency Recovery: security administrator enrols contacts; contacts verify independently. Platform Tenant Management -> select tenant -> Tenant Emergency Recovery: an MFA-enrolled platform operator opens a case. Independently notified contacts confirm or dispute. Following the 24-hour cooling-off, two distinct MFA-enrolled platform operators approve. The invitation is sent to a verified contact, never the operator. The tenant claimant redeems with their own login/MFA, then completes the restricted repair with a **new** OTP and signs in again.

There is no direct reset-password-for-tenant endpoint, shared developer password, bypass of tenant RBAC, or recovery privilege hidden in normal session claims. Advanced sharing remains deferred.

## Additional recovery release checks

- Confirm that normal password reset uses an HTTPS `METADRIVE_PASSWORD_RESET_BASE_URL` matching a trusted `WEB_ORIGIN` / `WEB_ORIGINS` entry, with tenant-controlled SMTP Named Credentials and validated sender identity. The separate platform recovery service uses its dedicated, secret `METADRIVE_RECOVERY_SMTP_URL` as described above.
- Before production recovery is enabled, independently rehearse operator identity evidence, two fresh MFA approvals following the 24-hour cooling period, verified out-of-band delivery, cancellation on dispute, one-time grant redemption and revoked-session denial in an isolated control database.
- Verify deployed Render revision and measure tenant RBAC read/write performance under concurrent load. Do not issue impersonation sessions, expose Named Credentials or restore intentionally revoked developer permissions.
