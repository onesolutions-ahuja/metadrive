# Isolated MCP operations broker (Oracle)

This is intended for installations where `metadrive-api.service` runs as `metadrive`
with `NoNewPrivileges=yes`. **Never turn this restriction off for MCP.**

## Design

A root-owned, systemd socket-activated broker accepts one strictly parsed
JSON request over `/run/metadrive-mcp-broker.sock` (root:metadrive, 0660).
The API's existing OAuth `operations:manage`, PlatformDeveloper and
`PlatformOperations` controls and security events are enforced **before**
a broker call. No arbitrary shell command, path, environment or secret is
accepted. All existing service-management actions remain allowlisted.
`mail_diagnostic` reports listener/container *metadata* only, not logs,
mailboxes, credentials, environment variables or DNS records.

## Safe rollout

1. Review and merge the code, then use the existing Oracle deployment
   workflow to deploy the compatible API build.
2. From the trusted checkout on the Oracle VM, run
   `sudo bash scripts/oracle/install-mcp-broker.sh`.
3. Restart only `metadrive-api.service` in a maintenance window.
4. Verify `systemctl show metadrive-api.service -p NoNewPrivileges` remains
   `yes`, `systemctl is-active metadrive-mcp-broker.socket` is `active`
   and `systemctl is-active metadrive-api.service` is `active`.
5. Verify the existing connected administrator has the scoped OAuth grant
   and `PlatformOperations/read`. Call `server_operation(status,api)`
   from ChatGPT. Do not start with restart or release activation.
6. Verify `mail_diagnostic` before expanding mail tooling. This command
   **does not** establish inbound/outbound mail deliverability.

## Rollback

Revert the API build using the established immutable release mechanism, and
run the following from an authorised VM session:

```bash
sudo systemctl disable --now metadrive-mcp-broker.socket
sudo rm -f /etc/systemd/system/metadrive-api.service.d/95-mcp.conf
sudo systemctl daemon-reload
sudo systemctl restart metadrive-api.service
```

Do not remove any Stalwart container, volume, TLS material or mailbox data.
The broker install does not alter DNS, Stalwart or VM firewall rules.
