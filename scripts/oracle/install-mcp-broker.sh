#!/usr/bin/env bash
set -Eeuo pipefail
[[ $EUID == 0 ]] || { echo 'Run as root' >&2; exit 1; }
src=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ $(systemctl show metadrive-api.service -p User --value) == metadrive ]] || exit 1
# Preserve the current API sandbox; never turn off NoNewPrivileges.
[[ $(systemctl show metadrive-api.service -p NoNewPrivileges --value) == yes ]] || {
  echo 'Unexpected API sandbox configuration; aborting' >&2; exit 1;
}
id metadrive >/dev/null
install -o root -g root -m 0755 "$src/metadrive-mcp-operations" /usr/local/sbin/metadrive-mcp-operations
install -o root -g root -m 0755 "$src/metadrive-mcp-activate" /usr/local/libexec/metadrive-mcp-activate
install -o root -g root -m 0755 "$src/metadrive-mcp-broker.py" /usr/local/libexec/metadrive-mcp-broker.py
cat >/etc/systemd/system/metadrive-mcp-broker.socket <<'UNIT'
[Unit]
Description=MetaDrive restricted operations socket
[Socket]
ListenStream=/run/metadrive-mcp-broker.sock
SocketUser=root
SocketGroup=metadrive
SocketMode=0660
Accept=yes
RemoveOnStop=yes
[Install]
WantedBy=sockets.target
UNIT
cat >/etc/systemd/system/metadrive-mcp-broker@.service <<'UNIT'
[Unit]
Description=MetaDrive restricted operations request
[Service]
Type=exec
User=root
Group=root
ExecStart=/usr/bin/python3 /usr/local/libexec/metadrive-mcp-broker.py
StandardInput=socket
StandardOutput=socket
StandardError=journal
NoNewPrivileges=yes
ProtectHome=yes
PrivateTmp=yes
ProtectSystem=strict
RuntimeMaxSec=25
UNIT
install -d -m 0755 /etc/systemd/system/metadrive-api.service.d
cat >/etc/systemd/system/metadrive-api.service.d/95-mcp.conf <<'UNIT'
[Service]
Environment=METADRIVE_MCP_ORIGIN=https://api.unesolutions.co.uk
Environment=METADRIVE_MCP_OPERATIONS=enabled
Environment=METADRIVE_MCP_BROKER_SOCKET=/run/metadrive-mcp-broker.sock
UNIT
rm -f /etc/sudoers.d/metadrive-mcp
systemctl daemon-reload
systemctl enable --now metadrive-mcp-broker.socket
echo 'Broker socket enabled. Deploy compatible API build before restarting metadrive-api.service.'
