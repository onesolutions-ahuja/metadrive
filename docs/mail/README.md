# Stalwart Mail integration

This integration targets Stalwart 0.16+ and uses JMAP for management and mailbox data. It does not use the removed legacy REST principal API.

## Server configuration

Configure these on the MetaDrive API process, never in browser build variables:

- `STALWART_BASE_URL=http://127.0.0.1:8080` when the API and Stalwart run on the same VM and Stalwart's HTTP listener is loopback-bound.
- `STALWART_API_KEY=<dedicated restricted server-side key>`
- `STALWART_ALLOWED_DOMAINS=unesolutions.co.uk` (exact comma-separated allowlist).

Never use a `VITE_*` variable for the management key. Keep Stalwart port 8080 private. Create a restricted API key with Replace permission mode and only the account/domain get/query/create/update/destroy permissions needed for the management service.

The service creates a deterministic internal Stalwart Group per MetaDrive tenant and uses standard `memberGroupIds` membership to scope mailboxes. Do not manually delete generated `mdt<tenant-uuid-without-hyphens>` groups. The assignable `MailAdmin` permission set grants `Mailbox:read` and `Mailbox:manage` but is not automatically assigned.

## GitHub Pages frontend and API-host proxy

The frontend release is hosted by GitHub Pages and uses `https://api.unesolutions.co.uk/api` as its API base. Therefore **do not change apex DNS or try to proxy `/mail` on the apex Nginx server**. The `/mail` page is part of the SPA and is restored by the existing Pages fallback. JMAP calls are routed through the API hostname at `/api/mail-jmap/`, then Nginx strips that prefix before forwarding to Stalwart.

Merge the following location into the existing HTTPS server block for `api.unesolutions.co.uk`. Preserve existing API routes, certificates, headers and logging. Do not replace the whole server block.

```nginx
# Mailbox JMAP proxy: only user-authenticated JMAP traffic, no admin API key.
location ^~ /api/mail-jmap/ {
    if ($request_method = OPTIONS) {
        add_header Access-Control-Allow-Origin "https://unesolutions.co.uk" always;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept" always;
        add_header Access-Control-Max-Age 600 always;
        add_header Vary Origin always;
        return 204;
    }

    add_header Access-Control-Allow-Origin "https://unesolutions.co.uk" always;
    add_header Access-Control-Allow-Methods "GET, POST, OPTIONS" always;
    add_header Access-Control-Allow-Headers "Authorization, Content-Type, Accept" always;
    add_header Vary Origin always;

    proxy_pass http://127.0.0.1:8080/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 5s;
    proxy_read_timeout 60s;
    client_max_body_size 25m;
}
```

With the trailing slash on `proxy_pass`, this maps:
- `/api/mail-jmap/.well-known/jmap` → Stalwart `/.well-known/jmap`
- `/api/mail-jmap/jmap` → Stalwart `/jmap`
- `/api/mail-jmap/jmap/upload/<accountId>` → Stalwart `/jmap/upload/<accountId>`

This route forwards the mailbox user's own HTTP Authorization header. It does not expose or use the Stalwart management API key. The CORS origin is intentionally exact; if the production frontend is served from a different origin, change it only to that verified origin. Do not use wildcard CORS with authorization headers.

Before reload, run `sudo nginx -t`; reload only after it passes. Verify the existing `https://unesolutions.co.uk` site and `https://api.unesolutions.co.uk/api/health` (or the repository's current health route) still work. Keep port 8080 private.

## UI features

- `/mail`: mailbox sign-in, folders, inbox search, reading, mark-as-read, reply, forward, compose, attachment sending (20 MB total limit), and saving drafts to the Drafts folder.
- `/mail-admin`: MetaDrive-authenticated tenant mailbox listing, creation, description/quota editing, password reset, and confirmed deletion.

Saved drafts persist in Stalwart's Drafts folder. Editing a previously saved draft and forwarding original binary attachments are not yet supported. Suspension is not implemented because Stalwart's standard Account object does not expose a simple enabled/disabled flag; the UI must not fake suspension by overwriting credentials.

## DNS and mail delivery

No DNS records are changed by this repository. Preserve existing apex GitHub Pages records, current MX, SPF, Brevo sending records, DKIM and DMARC until the live server has been checked and the owner approves an exact DNS diff. Do not create multiple SPF records or invent DKIM keys.

Before changing MX, independently verify Stalwart listener bindings and TLS, OCI network rules, SMTP submission on 587/STARTTLS, inbound delivery, outbound delivery, SPF, DKIM and DMARC. The existing OCI Email Delivery setup does not by itself prove that this Stalwart host can send or receive mail.

## Live rollout checks

After deploying the MetaDrive API and updating the Nginx API-host location:

1. Confirm `STALWART_BASE_URL`, `STALWART_API_KEY`, and `STALWART_ALLOWED_DOMAINS` exist in the server runtime.
2. From a browser on the production origin, verify JMAP discovery at `https://api.unesolutions.co.uk/api/mail-jmap/.well-known/jmap` returns JSON with proxy-rewritten paths and correct CORS headers.
3. Sign in to `https://unesolutions.co.uk/mail` with a real mailbox. Test folders, search, read, send, attachment, draft save and forward.
4. Verify `/mail-admin` denies users without Mailbox RBAC permissions and that two tenants cannot see or mutate each other's mailboxes.
5. Create a disposable test mailbox, confirm it exists in Stalwart, verify persistence across a container restart, then delete only the test mailbox.
6. Check Nginx/Stalwart logs for errors and confirm passwords/API keys are not logged.
7. Verify real inbound/outbound delivery before approving DNS changes.

The GitHub repository connector can validate source and GitHub Actions but cannot access the live Oracle VM, Nginx, Cloudflare zone, OCI network rules, Stalwart API key, or real mail delivery. Those live checks must be completed on the actual host; no production DNS or mail cutover should be claimed until they pass.
