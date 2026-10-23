# Security and identity implementation phases

The supplied audit is a starting checklist, not a verified current inventory. Inspection found existing password recovery endpoints and SMTP delivery through Named Credentials, SQL TOTP MFA challenges/enrollment, OAuth authorization/PKCE services, profile/tab/record-type permissions and a system-permission mapping. These need verification and gap closure rather than duplicate engines.

## Phase 1 — Password and login protection

- Tenant-configurable password length (12–128 minimum, 1024 maximum), optional uppercase/lowercase/number/symbol requirements, password history (0–24), expiry (off or 1–365 days), failed-login threshold (3–20) and lock duration (1–1440 minutes).
- Defaults: minimum 12, complexity flags off, five prior passwords, expiry off, five failed attempts and 15-minute lockout. Existing credentials are preserved. Historical hashes accumulate from subsequent password changes; history cannot be reconstructed retroactively.
- SQL row locks serialize credential checks. Failed attempts commit before rejection; locked and disabled accounts never receive sessions. Automatic lockout revokes existing access and refresh sessions. Successful password verification clears counters; elapsed locks start a fresh counter. Administrator unlock also clears counters.
- Password change and recovery share complexity/history validation and revoke access/refresh sessions, pending recovery tokens and MFA challenges. Recovery does not lift an administrator's account lock or bypass MFA. Expiry applies to login, MFA session issuance, access authentication and refresh. SMTP sending is disabled; expired users cannot receive recovery email until replacement Flow-based HTTPS HTTP Callout delivery is configured.
- Login password verification, rejection, expiry, successful session creation and rejected MFA codes use the existing tenant security event stream. Unknown accounts have a nullable actor, never a fabricated administrator. Password-stage events include the submitted login identifier and Express-resolved IP; secrets/tokens/passwords are excluded. Successful MFA/session events are distinct from password verification.
- Password policy is editable under Company Settings → password recovery. Login events appear in the existing security activity panel (most recent 50; API maximum 100). Existing `Security:read` / `Security:manage` grants apply through central RBAC, including revocable OneEngine grants. No new permission bypass or optional-app dependency.
- Core provisioning seeds the relational policy; the additive migration seeds existing tenants without overwriting customisations. Policy reads fall back to the same defaults for tenants created outside the supported provisioner. No business data is removed.

Deploy the normal Core migrations including `20261121-login-password-policy.sql` before serving the updated application. Configure and test the tenant's SMTP Named Credential and sender before enabling expiry. LINK recovery additionally requires `METADRIVE_PASSWORD_RESET_ORIGIN`. Actual email delivery depends on deployment credentials and provider connectivity; unit tests cannot certify those.

## Phase 2 — Federation, MFA and session boundaries

Phase 2 implementation and deployment requirements are recorded in [IDENTITY_SESSION_CONTROLS.md](IDENTITY_SESSION_CONTROLS.md). Implemented controls include the working MFA login/settings UI, hashed one-time backup codes, WebAuthn, SP-initiated SAML/OIDC with explicit subject links, tenant/profile IP/hour restrictions, session deadlines/assurance, and an optional SQL-configured secure HTML host. Recovery factors are email, backup codes and passkeys, as selected by the owner. The remaining bullets below preserve the original phase checklist; provider/hardware acceptance testing is deployment work.

- Verify existing TOTP enforcement end to end; add backup codes and WebAuthn, plus enrollment and recovery administration.
- Complete SAML 2.0 / OpenID Connect federation, tenant domain routing and social identity linking. Distinguish inbound federation, OAuth Connected Apps/API authorization and existing outbound integration OAuth; inspect each flow before reuse.
- Add profile login hours, login/trusted IP policies, session assurance levels and configurable session timeouts. Finish CSP/clickjack settings and enforcement.
- Assess security-question requirements and recovery factors with the owner. Questions are not implemented in Phase 1.
- Verify Object CRUD/View All/Modify All, field permissions, profile navigation and record-type enforcement across all entry points and integrations.

## Phase 3 — Governance, licensing and monitoring

Implemented controls and supported boundaries: [SECURITY_GOVERNANCE_PHASE3.md](SECURITY_GOVERNANCE_PHASE3.md).

- Complete the system-permission catalogue and map each permission to enforced central RBAC decisions; preserve individual grant revocation and explicit denies.
- Complete user and permission-set licence entitlement checks and administration, separate from permission grants.
- Audit every metadata/setup mutation through shared engines, with tenant/actor/correlation context, redaction, retention and paginated/exportable Setup Audit Trail.
- Add Event Monitoring and metadata-configured Transaction Security actions, asynchronous processing and operational dashboards using existing Flow/job engines.
- Add the OAuth authorization server / Connected Apps capability for external API clients, with consent, scopes, central RBAC and separate licence checks. Inbound SSO and outbound Named Credential OAuth are separate capabilities.

## Validation

`login-password-policy.test.ts` covers policy bounds/complexity, denied RBAC, history, committed counters, threshold/elapsed lock behavior, unknown-account auditing and expiry. Existing password reset, authentication, MFA and refresh tests are retained.

`apps/server/scripts/login-password-policy-sql-smoke.mjs` exports an isolated-schema integration suite for a PostgreSQL-compatible executor with `query` and `transaction`. It checks migration replay/customisation preservation, foreign-tenant isolation, lockout, password history, reset replay, session revocation and expiry without reading the application's `.env` or touching its data.

After the server build, run it against an explicitly configured test PostgreSQL database with `node apps/server/scripts/login-password-policy-sql-smoke.mjs` and `METADRIVE_SQL_TEST_DATABASE_URL` set. The suite creates and removes only its own temporary schema on one connection.

Implementation validation: all 478 unit tests (397 server, 33 metadata, 48 component), four login tests and the web/server production build passed. The SQL integration suite passed using an isolated PGlite PostgreSQL runtime, including policy save/read, access/refresh expiry and migration replay. SQL API contracts, project references, web layout and lazy bundle checks passed. The Core file-boundary check remains blocked by the pre-existing unregistered `apps/server/src/system-files/record-query.ts`; it was already present in the working tree before Phase 1. No production database migration or external SMTP delivery was performed.

Production database/provider verification and the Phase 2/3 controls remain separate work; this phase does not claim Salesforce feature parity.

Phase 2 follow-up validation: `npm run check` now passes in the current checkout, including the Core file-boundary check, 491 tests, builds and lazy loading. Isolated signed WebAuthn/OIDC/SAML and recovery/session SQL tests also pass. See the Phase 2 implementation document for deployment prerequisites, supported protocol variants and remaining provider/hardware acceptance testing. Phase 3 implementation and deployment requirements are recorded in [SECURITY_GOVERNANCE_PHASE3.md](SECURITY_GOVERNANCE_PHASE3.md).
