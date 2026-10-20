# Phase 3: security governance and Connected Apps

Phase 3 extends the existing Core authentication, central RBAC, relational metadata and durable Flow jobs. Settings are under Company Settings → MFA/security → Security governance. The permissions editor now reads the SQL system-permission catalogue. OneEngine grants remain individually configurable and revocable; neither licensing nor Connected Apps grants permissions.

## Licensing and permissions

- User licences have enabled/expiry/seat limits, resource/action capabilities and optional automatic assignment to newly created users. Permission-set licences gate grants from direct assignments, profiles, roles and groups. Explicit denies remain effective even when a permission-set licence is unavailable.
- Existing tenants/users receive a compatible CoreFull user licence once. Seed receipts prevent migration replay from restoring revoked assignments or capabilities. New tenants receive the same initial pool; platform administrators can restrict or disable it. No business records are deleted.
- Sessions require an active user licence. Every central permission decision additionally checks licence capabilities. Expiry, revocation and disabled pools therefore take effect on the next request/job authorization. Assignment changes revoke the affected user's sessions.
- Tenant security administrators assign existing pools and configure permission-set requirements. Issuing or changing licence pools requires the existing separately assigned platform-administration boundary plus `PlatformTenant:manage`. A tenant wildcard alone cannot issue licences to itself or another tenant. Platform pool editing preserves existing capabilities outside the catalogue.
- `Record:modifyAll` now participates in the shared record-access function alongside per-object Modify All and View All. Object/field/record-type checks, explicit denies and restrictions still apply. SQL integration verifies private records, View All, Modify All, record deny and cross-tenant rejection.

## Setup Audit Trail

Database triggers capture inserts, updates and deletes on setup tables, including metadata child rows, security policies, permissions, licence pools, installations and Connected Apps. Coverage is installed in each migration transaction and listed through the audit API. Business record values, runtime queues/counters, authentication tokens and existing logs are classified separately; this is setup auditing, not business-record change history.

Events contain the affected tenant, actor tenant/user, correlation ID, table, operation, row identifier, changed column names and time. Field values are never copied into the trail, including passwords, credential ciphertext and client secrets. Trigger-local JSON conversion is transient; audit/settings storage is relational. Audit rows roll back with the mutation. API requests and worker handlers supply transaction-local context. Migrations and unauthenticated recovery/login stages can have no authenticated actor.

The trail is append-only, including a TRUNCATE guard. It is retained indefinitely; administrators can page and export CSV in batches of 5,000 without an automatic audit-deletion job. Global setup history additionally requires platform authority. Database owners can disable triggers, so independent backups and database access controls remain necessary.

## Event Monitoring and Transaction Security

Authenticated API and metadata requests record tenant/user, correlation ID, sanitised path, method, status, duration and resolved IP. Session issuance is also monitored as a login event. Query parameters, tokens, request bodies and response bodies are excluded. Password/MFA failures remain in the existing security-event stream; transaction rules do not process unknown-account login attempts.

Rules select API, metadata or login events, method, path prefix, per-user request threshold and time window. Responses are Block, Revoke Sessions or a published Autolaunched Flow. Threshold counters use atomic SQL updates. Flow responses enqueue once per user/rule/window through the existing durable `flow.execute` job. The selected service identity requires central Flow permissions; execution rechecks tenant, licence, app entitlement, publication and current permissions. Editing a rule resets its counters and cancels queued responses. Work already executing cannot be retracted.

Request monitoring can be disabled independently of rule enforcement. Event retention is configurable from 90 to 3,650 days; the settings screen provides explicit pruning. Monitoring rows and operational summaries have pagination. Rule evaluation/queueing errors fail the request; completion-write failures emit an operational error and leave the request event unfinished. Deploy the existing durable worker for asynchronous Flow responses.

## OAuth Connected Apps

This authorization server is separate from inbound SAML/OIDC and outbound Named Credential OAuth. Supported clients are public clients and confidential clients using `client_secret_post`; supported grants are authorization code with mandatory PKCE S256 and rotating refresh tokens. Password, implicit and client-credentials grants are deliberately unsupported.

1. An administrator registers an enabled app, exact HTTPS redirect URLs, allowed scopes and an explicit user allowlist. Confidential secrets are high entropy, hashed in SQL, shown once and rotatable. Editing an app or rotating its secret revokes existing consents.
2. The client sends the user to `/api/oauth/authorize` with `response_type=code`, client ID, registered redirect, PKCE challenge/method, state and space-separated scopes. State must be 16–512 characters. The tenant's registered web origin hosts `/oauth/authorize`; serve this SPA route on the web deployment.
3. The authenticated user reviews the app and scopes and explicitly allows or denies access. Consent can require an MFA-verified session (default). Configure the tenant's Optional/Required MFA policy and enroll the user before requiring this; consent does not itself perform MFA step-up. SSO returns preserve the pending consent route when browser session storage is available.
4. The client exchanges the two-minute, single-use code at `/api/oauth/token`, supplying the identical redirect and PKCE verifier. Confidential clients also supply their secret. Tokens are the existing Core sessions, bound to the consent and scope set. Refresh tokens cannot be used at the browser-cookie refresh endpoint. Reusing a rotated refresh token revokes the consent's access and refresh tokens. `/api/oauth/revoke` revokes a token's consent.

Supported scopes narrow access to record reads, record writes, metadata reads or Flow execution. Every request still enforces tenant isolation, active user/client assignment, live consent, currently configured scopes, `API:execute`, user/permission-set licences and existing object/field/record/Flow/app permissions. OAuth tokens cannot access setup administration, browser authentication or consent endpoints. Registered client origins receive bearer-token CORS access without credentialed browser-cookie access.

## Deployment and validation

Apply Core migrations `20261123-security-governance.sql`, `20261124-connected-apps.sql` and `20261125-setup-audit-coverage.sql` before serving the updated API. These are additive and contain no customer-data cleanup. The normal migration runner updates setup-audit coverage after subsequent migrations.

`security-governance.test.ts` covers permission rejection, concurrent request-context isolation, SQL context escaping, CSV formula escaping, path sanitisation, invalid settings/rules and unsupported OAuth requests. `security-governance-sql-smoke.mjs` uses an isolated schema and the real services, full schema and migrations. It verifies licensing/seats/expiry/denies/replay, record access, audit redaction/rollback/append-only protection, monitoring/block/revoke/queued Flow cancellation, OAuth consent/PKCE/code replay/scopes/rotation, confidential-secret hashing and live HTTP token/CORS/actor/correlation enforcement. It also exercises actual SqlPersistence transaction context with RBAC snapshot isolation.

After building the server, run `npm run test:governance:sql --workspace apps/server` with an explicitly configured `METADRIVE_SQL_TEST_DATABASE_URL` pointing to a dedicated test database. The runner reads no application `.env` and removes only its own temporary schema. Isolated PostgreSQL-compatible PGlite runs passed for this suite and the Phase 1/2 signed identity/recovery regression suite. No production migration, external client deployment, IdP configuration or SMTP delivery was performed. Production TLS/proxy/CORS, authenticator and provider acceptance testing still requires the deployed environment.
