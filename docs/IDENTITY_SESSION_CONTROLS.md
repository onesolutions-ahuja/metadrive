# Phase 2 identity and session controls

Implementation extends the existing Core authentication service and central `Security:read` / `Security:manage` RBAC permissions. OneEngine remains an ordinary revocable permission set. No application-specific identity bypass, implicit email matching or automatic permission grants were added.

## Available controls

User administration can set a per-user default landing destination. New users default to Setup Home; an administrator may choose an installed application such as Acetill. Login and session restoration read this preference from `/auth/me` and route to the registered app frontend. The preference is not an access grant: tenant installation, entitlement and central RBAC are checked independently, and unavailable applications leave the user in Setup.

Company Settings → Security & Recovery contains personal authenticator enrollment, tenant MFA policy, backup codes, passkey registration/removal, session/login restrictions, identity providers and explicit identity links. Login supports authenticator codes, backup codes, passkeys and enabled SSO providers. SMTP sending has been removed; password-reset and other email delivery remain unavailable until configured through an HTTPS Named Credential and HTTP Callout Flow. The owner selected email, backup codes and passkeys; security questions were not added.

- TOTP preserves the existing encrypted secret vault and replay counter. Required first-login enrollment now works in the login UI. Confirming a new authenticator invalidates old backup codes and sessions. Disabling an authenticator also revokes sessions and is prohibited when tenant MFA is required.
- Ten random 80-bit backup codes are displayed once, stored only as SHA-256 digests, consumed atomically and audited. Generating a replacement set requires the current password and a fresh, enrolled TOTP code. Keep backup codes outside the application before losing an authenticator. Their purpose is to complete the MFA challenge after primary authentication, not to replace the account password.
- Administrator recovery resets another tenant user's MFA factors only after central `Security:manage`, current-password verification and a fresh administrator TOTP code. It deletes that target's factors and pending enrollment, invalidates login/password-recovery challenges, revokes sessions and records the administrator/target in the audit stream. It cannot reset another tenant's user or the acting administrator. Required MFA still requires new enrollment at the next login.
- WebAuthn uses SimpleWebAuthn with required user verification, registered HTTPS tenant origins, per-origin RP IDs, SQL challenges, public keys and counters. Registration requires a current authenticated session and password. Login is a second factor on the existing password/SSO MFA challenge; it does not introduce another session engine. Parent and passkey challenges are consumed together. Removing a key revokes sessions. SAML and WebAuthn libraries load only when invoked.
- OIDC uses authorization code + PKCE, browser-bound one-time state, a nonce and signature/issuer/audience/expiry checks on ID tokens. It supports public clients and `client_secret_post` confidential clients; providers requiring other token authentication methods need a subsequent adapter. The provider settings create tenant-linked HTTPS Named Credentials for token and JWKS endpoints; requests use the shared outbound HTTP transport, validate and pin public DNS addresses, reject redirects, enforce size/time limits and create tenant-scoped integration activity.
- SAML uses Node-SAML, requires signed responses and assertions, validates issuer/audience/time/recipient, always validates `InResponseTo`, and stores request IDs in SQL. Each request ID is bound to the pending browser/state request; unsolicited IdP login is not accepted. Current implementation is SP-initiated SSO, without IdP-initiated login, encrypted assertion private keys or single logout.
- Federated accounts require an explicit `(tenant, provider, subject) → user` link. OIDC social providers use the same configuration and links. Matching email, IdP groups or email usernames never grant roles, OneEngine or cross-tenant access. SSO returns an HttpOnly, one-minute, single-use exchange ticket, then uses the normal local MFA/session path. Tokens and assertions are not placed in redirect URLs.
- Tenant and assigned-profile login IP ranges and login hours are intersected. Multiple ranges/windows within one scope are alternatives; different scopes must all permit access. Empty scopes impose no restriction. Times use named time zones and SQL local-time conversion, including DST. Split overnight windows across days. Trusted ranges classify configured networks; they do not bypass login restrictions, MFA or permissions.
- Configurable access lifetime, maximum refresh lifetime, inactivity timeout and required MFA assurance are checked server-side. Refresh rotation preserves its original absolute deadline and MFA assurance. Access activity updates only the same browser's session family. A shared SQL boundary predicate applies to login, refresh and authenticated access. Authenticated token validation, policy checks and activity updates run in one SQL statement.
- The optional production web host applies tenant framing/CSP settings to actual HTML and assets. API responses also have safe default browser headers. The CSP permits same-origin scripts, same-origin connections, inline styles, data/HTTPS images, blocks plugins, and restricts framing. Custom cross-origin script/connect/frame allowlists are not implemented; turning CSP off is an explicit administrator setting.

Core provisioning seeds relational session policy defaults. The versioned migration seeds existing tenants without replacing custom settings. Defaults preserve existing access/refresh lifetimes (60 minutes / 30 days), add a 60-minute inactivity timeout, and leave mandatory MFA off. Every new administrative mutation is audited. These settings never grant CRUD, field, record-type, tab, app or entitlement permissions.

## Deploy and configure

1. Run normal Core migrations, including `20261021-user-landing-app.sql` and `20261122-identity-session-controls.sql`, before serving the updated application. The identity-controls migration signs out legacy sessions once because their access/refresh family relationship cannot be reconstructed safely. Replaying it does not sign out sessions already using the new family columns. Business records, credentials and tenant customisation are retained.
2. Use HTTPS and register each login hostname through the existing tenant-domain administration. Passkeys require HTTPS. Behind a proxy, set `METADRIVE_TRUST_PROXY_CIDRS` to an explicit comma-separated list of trusted proxy IPs/CIDRs and ensure those proxies sanitize forwarded headers. Without it Express uses the socket address. Arbitrary `trust proxy=true` and untrusted `X-Forwarded-For` are not accepted as identity. IPv4-mapped socket addresses are normalized for IPv4 range checks.
3. Preserve the existing Named Credential encryption-key configuration for TOTP, federation credentials and PKCE verifiers. OIDC settings require `Security:manage`, `NamedCredential:manage` and `HTTPCallout:execute`; secrets are stored only in linked tenant Named Credentials. Do not enable Required MFA until encryption is ready and administrators have enrolled factors and saved backup codes.
4. Set `METADRIVE_AUTH_PUBLIC_ORIGIN` to the canonical HTTPS API origin, without a trailing slash or path. The settings UI displays the callback URL: `<origin>/api/auth/federation/callback`. Register it exactly with the IdP. Both OIDC GET and SAML POST callbacks are supported. Cross-site secure cookies must be allowed by the deployment/browser; a same-origin host is preferable.
5. Add an identity provider in Settings. For OIDC, provide issuer, authorization/token/JWKS URLs, client ID and optional secret; saving creates and links two tenant HTTPS Named Credentials, and a blank secret preserves the saved linked secret. For SAML, provide IdP issuer, SSO URL and signing certificate; the UI displays the SP Entity ID (`<callback>/<provider-id>`). Configure the IdP to sign both response and assertion. Save each user's exact stable `sub` / `NameID` link before enabling SSO. No live provider is enabled by seeding.
6. For same-origin production HTML hosting, set `METADRIVE_WEB_DIST` to the absolute built `apps/web/dist` directory. Only registered tenant hostnames serve that frontend. If a CDN or another web server serves HTML, configure equivalent CSP and frame headers there; API headers cannot protect an independently hosted document.
7. Configure the platform mail transport once using deployment secrets: `METADRIVE_PLATFORM_SMTP_HOST`, `METADRIVE_PLATFORM_SMTP_PORT` (`465` or `587`), `METADRIVE_PLATFORM_SMTP_USERNAME`, `METADRIVE_PLATFORM_SMTP_PASSWORD`, and `METADRIVE_PLATFORM_SMTP_FROM_EMAIL`. Keep these values server-side; never put them in tenant settings or expose them to browser code. Password recovery uses this platform mailer and no tenant SMTP Named Credential. LINK recovery also requires `METADRIVE_PASSWORD_RESET_ORIGIN`. Password reset leaves an administrator account lock intact and requires MFA on subsequent login.

Changing a login restriction or requiring MFA can prevent the administrator's current session from continuing. Configure intended tenant/profile ranges and hours before saving. Automatic provisioning and alternate recovery bypasses are intentionally absent.

## Validation

- `npm run check` passed: 406 server tests, 33 metadata tests, 48 component tests and four login tests (491 total), architecture/API-contract checks, production web/server builds and lazy-bundle validation. `git diff --check` passed.
- Isolated SQL integration uses the real service implementations with an isolated PostgreSQL-compatible executor. It covers tenant/profile intersection, trusted ranges, hours, idle and absolute timeouts, MFA assurance, TOTP, backup replay, migration replay/customisation preservation, signed synthetic WebAuthn registration/authentication, origin/counter/challenge rejection, signed OIDC state/nonce/browser/ticket isolation and signed SAML login/replay.
- Run `npm run build:system --workspace apps/server`, then set `METADRIVE_SQL_TEST_DATABASE_URL` to a dedicated test database and run `npm run test:identity:sql --workspace apps/server`. The runner reads no application `.env`, uses one connection, and creates/removes only its own temporary schema. The committed `idp.test.*.pem` files are synthetic test-only signing credentials, never deployment credentials.
- During implementation the SQL suite and full baseline schema plus all versioned migrations/replay passed with isolated PGlite. Tests also verified administrator MFA recovery audit/session revocation and rejection of cross-tenant recovery. External IdP availability, production TLS/proxy/cookie behaviour, SMTP delivery and physical authenticator devices still require deployment acceptance testing. No live database migration, tenant restriction, provider configuration or email was performed here.
- Existing CRUD/record access, field-security, record-type, RBAC navigation, app-entitlement and Flow tests continue to pass; federation issues the same tenant/user sessions and does not add another authorization path.

Inbound SSO is separate from the existing outbound Named Credential OAuth service and the OAuth authorization server/Connected Apps feature for external API clients. API-client consent, scopes and licensing are documented in [SECURITY_GOVERNANCE_PHASE3.md](SECURITY_GOVERNANCE_PHASE3.md).

## Platform-owned recovery email isolation

Password recovery is an essential Core security function, not a tenant mail app or an
arbitrary tenant-configured HTTP callout. The existing `PasswordResetService` creates
tenant/user-bound one-time challenges, and `NamedCredentialService.sendRecoveryEmail`
intentionally ignores caller-provided Named Credential IDs and sender addresses.
Only `sendPlatformRecoveryEmail` resolves the platform SMTP transport from deployment
secrets. A tenant with no mail provider can therefore receive recovery messages
without being granted platform email credentials or another tenant's data.

Platform SMTP configuration is checked for a syntactically valid sender address,
a non-local DNS hostname and an allowed TLS-enabled port (465 or 587) before
password-recovery-dependent settings may be activated. Delivery still verifies
public DNS resolution and certificate validity at send time. These deployment
secrets must not be copied into SQL tenant settings, frontend metadata, Flow
variables or Named Credentials accessible to tenants.

The recovery endpoint resolves and scopes identity to the requesting tenant;
the email transport receives only recipient and message details and never
performs password mutations. If delivery fails, the issued challenge is removed,
and the public acknowledgement does not disclose account existence. Password
confirmation uses a transactional tenant-bound lookup, consumes outstanding
challenges, revokes sessions and audits the event.

**Scope boundary:** This existing recovery path always uses the platform
provider. Tenant-supplied providers for ordinary business email, optional
verified tenant-security senders and provider failover must be designed as
separately authorised communication routes; do not enable an unverified tenant
HTTP callout to receive password-reset secrets. There is no automatic tenant
mail/marketing entitlement through platform SMTP.

**Operations:** Set the five `METADRIVE_PLATFORM_SMTP_*` deployment variables
listed above, configure SPF/DKIM/DMARC for the sender domain, and verify
delivery and rate limits in an isolated tenant before production use.
