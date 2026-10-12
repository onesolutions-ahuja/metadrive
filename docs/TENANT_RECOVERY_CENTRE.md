# MD-03.7 — Verified Tenant Recovery Centre

## Recovery workflow implemented in repository

Tenant administrators can pre-enrol up to four independent email recovery contacts from Company Settings, with fresh enrolled TOTP. Each contact receives a cryptographically random private email verification token. Two **different** contacts must already be verified for at least seven days before a recovery request; the tenant must also retain a currently verified custom-domain DNS TXT proof.

A platform superadministrator with fresh TOTP may open a case for an **existing, active, same-tenant user**. The system privately notifies enrolled contacts with case-specific tokens. Two independent pre-enrolled contacts must verify the case. Any one contact can dispute and permanently block the case. Incomplete notification rejects the case; unsigned body flags such as `verified: true` cannot establish ownership.

Only after 24 hours may two distinct platform superadministrators approve with **fresh non-reusable MFA**, with checks against their current live platform policies at invitation time. The case requester cannot approve. Platform operators cannot retrieve invitation tokens. A 15-minute, SHA-256-digested, single-use invitation is delivered privately to a confirmed contact.

The named claimant (and nobody else) signs in with their own active tenant account and fresh MFA to redeem the invitation. Redemption atomically consumes the token and creates a one-hour restricted `tenant_admin_repair_only` grant in the separate control DB. Its subsequent single-use repair changes only that claimant's tenant RBAC administrator profile, revokes the claimant's sessions and requires a new login. The platform **never** obtains the user's password, a tenant token, Named Credentials or impersonation privileges.

Audit events are recorded in the dedicated platform-control database, protected from ordinary update/delete by a PostgreSQL trigger. The tenant's security audit records administrator restoration. This does not pretend that a database owner cannot alter audit data.

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
