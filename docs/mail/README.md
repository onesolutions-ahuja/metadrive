# Stalwart Mail integration

This branch uses Stalwart 0.16+ management JMAP, not the removed legacy REST API.

Configure server-only variables `STALWART_BASE_URL=http://127.0.0.1:8080`, `STALWART_API_KEY`, and `STALWART_ALLOWED_DOMAINS=unesolutions.co.uk`. Keep the management listener on loopback and never expose the key to the browser.

`/mail` is the JMAP webmail UI. `/mail-admin` is MetaDrive-authenticated mailbox administration and requires `Mailbox:read` / `Mailbox:manage` in central RBAC. An assignable `MailAdmin` permission set is seeded but not automatically assigned.

Before deployment, add Nginx routing in the existing HTTPS server block: exact `/mail` should serve the existing MetaDrive SPA `index.html`; `/mail/` should redirect to `/mail`; and `/mail/` subpaths should proxy to `http://127.0.0.1:8080/` with the trailing slash so `/mail/jmap`, `/mail/.well-known/jmap`, and `/mail/jmap/upload/<accountId>` map to Stalwart's corresponding paths. Preserve all current site routes and test the configuration before reloading. Do not expose port 8080 publicly.

No Cloudflare DNS records are changed by this branch. Preserve apex website records and existing sender policies. Do not switch MX until the live listener, TLS, SMTP submission, inbound routing, outbound delivery, SPF, DKIM, and DMARC have been tested and the owner approves the exact DNS diff.

Repository changes cannot validate the Oracle VM, Nginx, Cloudflare, OCI firewall, certificates, or real delivery. Those remain live deployment checks.