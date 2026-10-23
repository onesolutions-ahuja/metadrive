#!/usr/bin/env bash
set -Eeuo pipefail
SOURCE="${1:?source checkout required}"
SHA="${2:?commit SHA required}"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid commit SHA"; exit 1; }
[[ "$SOURCE" == /* ]] || { echo "Expected absolute source path"; exit 1; }
SERVICE=metadrive-api.service
OVERRIDE=/etc/systemd/system/metadrive-api.service.d/90-oracle-actions.conf
PREVIOUS_OVERRIDE="$(mktemp)"
HAD_OVERRIDE=0
SWITCHED=0
RELEASE="/opt/metadrive/releases/gh-${SHA}"
if [[ -f "$OVERRIDE" ]]; then
  cp "$OVERRIDE" "$PREVIOUS_OVERRIDE"
  HAD_OVERRIDE=1
fi
rollback() {
  if [[ "$SWITCHED" == 1 ]]; then
    echo "Health verification failed: rolling API service back"
    if [[ "$HAD_OVERRIDE" == 1 ]]; then
      cp "$PREVIOUS_OVERRIDE" "$OVERRIDE"
    else
      rm -f "$OVERRIDE"
    fi
    systemctl daemon-reload
    systemctl restart "$SERVICE" || true
  fi
}
trap rollback ERR
test -f /etc/metadrive/production.env
systemctl is-active --quiet "$SERVICE"
test -f "$SOURCE/apps/server/dist-system/system-support/entrypoint.js"
if [[ ! -d "$RELEASE" ]]; then
  mkdir -m 0700 "$RELEASE"
  cp -a "$SOURCE/apps" "$SOURCE/node_modules" "$SOURCE/package.json" "$SOURCE/package-lock.json" "$RELEASE/"
  chown -R metadrive:metadrive "$RELEASE"
fi
mkdir -p "$(dirname "$OVERRIDE")"
cat > "$OVERRIDE" <<EOF
[Service]
WorkingDirectory=$RELEASE
ExecStart=
ExecStart=$(command -v node) $RELEASE/apps/server/dist-system/system-support/entrypoint.js
EOF
SWITCHED=1
systemctl daemon-reload
systemctl restart "$SERVICE"
OK=0
for attempt in $(seq 1 20); do
  if curl --silent --show-error --fail --max-time 4 https://api.unesolutions.co.uk/api/health | grep -q '"status":"ok"'; then
    OK=1
    break
  fi
  sleep 2
done
[[ "$OK" == 1 ]]
systemctl is-active --quiet "$SERVICE"
SWITCHED=0
trap - ERR
rm -f "$PREVIOUS_OVERRIDE"
echo "Oracle API deployment verified: $SHA"
