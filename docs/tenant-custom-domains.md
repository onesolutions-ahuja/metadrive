# MD-03.5 — Tenant custom domain runbook

## Domain ownership and isolation
- Tenant security administrators manage their own hostnames in **Company Settings → Custom domains**. Platform superadministrators can manage a selected tenant's domains in **Tenant Management** without accessing tenant passwords.
- Register a hostname such as `crm.customer.example` (not a URL). MetaDrive rejects duplicate claims across tenants, platform-owned hostnames, invalid/local names and more than five domains per tenant.
- Create the indicated `TXT` record at `_metadrive-verification.crm.customer.example` with the exact value displayed in the UI, then click **Verify DNS**. DNS TXT values are compared as complete TXT records, not concatenated across separate records.
- Domain records stay `PENDING` until live DNS ownership proof matches. Only `VERIFIED` domain bindings can authenticate users for their owning tenant. Attempts to authenticate against a pending registered hostname fail closed. Requests using an active verified hostname reject another tenant's bearer token, MFA challenge, login or refresh cookie.
- Host binding comes from a memoized tenant registry lookup, not from a DNS/SQL query on every login or API request.
- Every domain add, verification and removal is recorded in the existing tenant-management audit stream. Changes are persisted using the same transactional SQL metadata state as tenants; no new SQL table or paid service is required for 3.5.

## Enable HTTPS after verification
Ownership verification is **not** hosting activation. On the hosting service (Render or the reverse proxy/CDN in use):

1. Attach the **exact** verified hostname to the MetaDrive application service.
2. Configure the required provider DNS target (typically CNAME for subdomains or ALIAS/ANAME where supported). Keep the separate verification TXT record.
3. Complete provider TLS certificate provisioning and validate HTTPS, keeping the original Host header intact.
4. Test authentication with an owner-tenant user, and ensure another tenant's credentials fail on that hostname.
5. Confirm that the serving service is the one running this code. No application code can prove a certificate was provisioned at an external edge.

Same-host HTTPS requests from an approved verified domain are accepted by CORS; unrelated cross-origin requests are not. Canonical platform origin configuration remains unchanged.

## Removal / incident response
- Click **Remove** for a hostname; application registry binding and allowed verified-domain CORS mapping are revoked immediately after the write. The domain can be registered again only with a **new**, unique DNS challenge.
- **Also detach the hostname from the hosting provider.** Application removal does not modify Render/CDN domain entries or DNS records. Remove obsolete DNS targets/certificates as appropriate.
- Suspending a tenant continues to deny access independently of the domain's verification state.
- If a domain write cannot be durably committed, further domain mutations fail closed until the service is reconciled and restarted. Production Aiven migrations are not applied by this feature PR.

## Automated verification
- `npm run test --workspace apps/server` includes domain validation and tenant-management API/RBAC/persistence smoke tests.
- The relational staging CI includes compiled server startup with the runtime `.mjs` dependencies packaged in `dist`.
- Positive DNS TXT chunk matching is unit-tested. Live DNS verification of a customer-controlled hostname must be completed during actual domain onboarding (an arbitrary test hostname cannot return a randomly generated proof).
