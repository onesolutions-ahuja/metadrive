#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run with sudo'; exit 1; }
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# Installing helpers grants only their fixed operation set, not arbitrary sudo.
id metadrive >/dev/null
[[ $(systemctl show metadrive-api.service --property=User --value) == metadrive ]] || { echo 'Expected API service user metadrive; no changes made'; exit 1; }
[[ $(systemctl show metadrive-api.service --property=NoNewPrivileges --value) == no ]] || { echo 'Service sandbox prevents sudo helpers; use a separate operations broker. No changes made.'; exit 1; }
install -d -o root -g root -m 0755 /usr/local/libexec
install -o root -g root -m 0755 "$source_dir/metadrive-mcp-operations" /usr/local/sbin/metadrive-mcp-operations
install -o root -g root -m 0755 "$source_dir/metadrive-mcp-activate" /usr/local/libexec/metadrive-mcp-activate
rule=$(mktemp)
trap 'rm -f "$rule"' EXIT
printf '%s\n' 'metadrive ALL=(root) NOPASSWD: /usr/local/sbin/metadrive-mcp-operations' > "$rule"
visudo -cf "$rule"
install -o root -g root -m 0440 "$rule" /etc/sudoers.d/metadrive-mcp
install -d -m 0755 /etc/systemd/system/metadrive-api.service.d
cat > /etc/systemd/system/metadrive-api.service.d/95-mcp.conf <<'UNIT'
[Service]
Environment=METADRIVE_MCP_ORIGIN=https://api.unesolutions.co.uk
Environment=METADRIVE_MCP_OPERATIONS=enabled
UNIT
systemctl daemon-reload
echo 'Helpers installed. Restart the API after deploying the MCP-enabled build.'
