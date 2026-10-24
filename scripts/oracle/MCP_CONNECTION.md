# Oracle MetaDrive MCP connection

The opt-in endpoint is `https://api.unesolutions.co.uk/api/mcp` (Streamable HTTP).
It reuses central authentication, tenant isolation, record/field permissions,
Flow runtime, transaction monitoring and audit events. It does not grant SQL
superuser access or arbitrary root shell commands.

## Deployment

1. Deploy the server build containing this change using the existing Oracle SQL
   API Deployment workflow. The additive migration runs through the normal runner.
2. From that same trusted checkout on the VM, run:

   ```bash
   sudo bash scripts/oracle/install-mcp-operations.sh
   sudo systemctl restart metadrive-api.service
   curl --fail https://api.unesolutions.co.uk/.well-known/oauth-protected-resource/api/mcp
   ```

   The installer enables MCP and installs two root-owned helpers and a narrowly
   scoped sudoers rule. Existing Nginx HTTPS routing already forwards to port 3001;
   no Nginx change is required. Verify the actual service runs as `metadrive` before
   using the operations helper. Installation does not assign anyone permissions.
3. In MetaDrive's Connected Apps setup, prepare a **public** OAuth client, require
   MFA, and permit only the intended administrator. Grant `mcp:access` plus the
   desired `records:read`, `records:write`, `metadata:read`, `flows:execute` and
   `operations:manage` scopes. Register the exact callback URL provided by the
   plugin connection setup; no wildcard or guessed callback. If a client ID is
   needed before that callback is available, keep the client disabled with your
   own HTTPS origin as a temporary redirect, then replace it with the exact
   callback before enabling the client. Capture the client
   ID (public), never a password or session token.
4. Create the private plugin only after verifying the endpoint. Its MCP entry is
   Streamable HTTP with OAuth `client.mode=provided`, `clientId` from step 3,
   `tokenEndpointAuthMethod=none`. OAuth authorization and token requests must
   include `resource=https://api.unesolutions.co.uk/api/mcp`. Discovery endpoints
   advertise PKCE S256. Authorization must complete interactively with the owner.
5. Verify `initialize`, `tools/list`, `list_objects`, and service `status` using the
   real connection. Do not use a write or restart as the connection smoke test.

## Available tools

- List/describe objects; list/get/create/update/delete business records.
- Execute existing published flows (including configured integrations).
- Platform service status, last 100 journal lines, scheduled API/worker restart.
- Activate a **previously built** `/opt/metadrive/releases/gh-<40 hex SHA>` API
  release, with a health check and rollback. This is not a build/upload facility.
  Use the existing GitHub deployment workflow to build a new release first.

Server operations additionally require OneEngine membership and central
`PlatformOperations/read` or `PlatformOperations/manage` permissions. Existing
explicit denies and revocations continue to apply; a tenant's OneEngine assignment
is not sufficient for host access. Permission labels are seeded in the central
catalogue; enable grants through normal permission administration.

Restarts and activations return **scheduled**, not success. Check status and the
`metadrive-mcp-*` system journal after completion. Record writes and flows must not
be automatically retried after a dropped connection; inspect the records/audit
trail first. Tool audit events contain tool names and correlation IDs, not record
payloads, tokens or credentials. Journal access is privileged and may contain
sensitive application logs; do not redistribute the output.

## Disable and rollback

Revoke the Connected App or its user assignment to invalidate its grants. Remove
`95-mcp.conf` and restart the API to disable the endpoint; remove
`/etc/sudoers.d/metadrive-mcp` to revoke helper access. The schema migration is
additive except for extending the scope check; older app versions ignore the new
nullable resource column. Existing non-MCP OAuth flows remain supported.

## Verification boundary

Local transport/security tests and the server build do not prove the live VM,
PostgreSQL migration, sudo policy, callback registration or ChatGPT connection
works. Each must be verified after deployment before calling the plugin connected.
