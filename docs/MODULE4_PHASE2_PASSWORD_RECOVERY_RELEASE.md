# Module 4 — Phase 2: Production password recovery setup

## Current deployment
- Render service: `metadrive` (`srv-db5o4e7avr4c739g0f7g`)
- Known HTTPS service origin: `https://metadrive.onrender.com`
- Aiven PostgreSQL service: `oneengine`, project `ahujavishalkumar-a080`
- Keep tenant SMTP credentials in tenant-owned encrypted **Named Credentials**; do not put per-tenant SMTP passwords into Render environment variables.

## Release configuration, not yet applied
1. Inspect the **existing** Render `WEB_ORIGIN` / `WEB_ORIGINS` and the actual browser-facing login origin. Never replace an existing approved list without preserving valid current front-end origins.
2. Set `METADRIVE_PASSWORD_RESET_BASE_URL` to that actual HTTPS login-page base origin, **only when** it is explicitly trusted by the web-origin configuration. Do not infer that the API Render URL is the browser login URL.
3. For each tenant, have a tenant security administrator select its SMTP Named Credential and sender address. Verify SMTP credentials, TLS, sender authorization and mailbox delivery without disclosing secrets.
4. Test the standard reset request and redemption against a disposable tenant account: generic 202 response, a single 15-minute token, correct HTTPS link, nonce single use, new password login, old JWT and refresh rejection, MFA retained, cross-tenant rejection, and audit events.
5. Confirm Render's deployed commit matches the approved release before marking production configuration verified; separately measure and check authorization performance.
6. Do not enable the **platform-assisted emergency recovery** route based on SMTP setup; its independent proof and restricted repair gateway are a separate security requirement.

## Production acceptance evidence
Record the actual WEB origin, reset-base origin, sender domain, tenant ID (not credential value), successful message-delivery result, reset and replay results, deployed commit, and timestamps. Never record plaintext tokens, SMTP passwords or JWTs.

## Cost protection
Use CI and isolated Aiven tests on feature branches. Merge once only after verification. Avoid speculative production environment updates or redeploys. No new paid services required.
