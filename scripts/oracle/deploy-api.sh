#!/usr/bin/env bash
set -Eeuo pipefail
SOURCE="${1:?source checkout required}"
SHA="${2:?commit SHA required}"
[[ "$SHA" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid commit SHA"; exit 1; }
[[ "$SOURCE" == /* ]] || { echo "Expected absolute source path"; exit 1; }

API_SERVICE=metadrive-api.service
WORKER_SERVICE=metadrive-worker.service
API_OVERRIDE=/etc/systemd/system/metadrive-api.service.d/90-oracle-actions.conf
WORKER_OVERRIDE=/etc/systemd/system/metadrive-worker.service.d/90-oracle-actions.conf
API_BACKUP="$(mktemp)"
WORKER_BACKUP="$(mktemp)"
HAD_API_OVERRIDE=0
HAD_WORKER_OVERRIDE=0
SWITCHED=0
RELEASE="/opt/metadrive/releases/gh-${SHA}"

[[ ! -f "$API_OVERRIDE" ]] || { cp "$API_OVERRIDE" "$API_BACKUP"; HAD_API_OVERRIDE=1; }
[[ ! -f "$WORKER_OVERRIDE" ]] || { cp "$WORKER_OVERRIDE" "$WORKER_BACKUP"; HAD_WORKER_OVERRIDE=1; }
restore_override() {
  local backup="$1" override="$2" existed="$3"
  if [[ "$existed" == 1 ]]; then
    cp "$backup" "$override"
  else
    rm -f "$override"
  fi
}
rollback() {
  trap - ERR
  if [[ "$SWITCHED" == 1 ]]; then
    echo "Oracle API/worker verification failed: restoring both previous releases"
    restore_override "$API_BACKUP" "$API_OVERRIDE" "$HAD_API_OVERRIDE"
    restore_override "$WORKER_BACKUP" "$WORKER_OVERRIDE" "$HAD_WORKER_OVERRIDE"
    systemctl daemon-reload
    systemctl restart "$API_SERVICE" || true
    systemctl restart "$WORKER_SERVICE" || true
  fi
  rm -f "$API_BACKUP" "$WORKER_BACKUP"
}
trap rollback ERR

test -f /etc/metadrive/production.env
systemctl is-active --quiet "$API_SERVICE"
systemctl is-active --quiet "$WORKER_SERVICE"
test -f "$SOURCE/apps/server/dist-system/system-support/entrypoint.js"
test -f "$SOURCE/apps/server/dist-system/system-support/job-worker-entrypoint.js"

if [[ ! -d "$RELEASE" ]]; then
  mkdir -m 0700 "$RELEASE"
  cp -a "$SOURCE/apps" "$SOURCE/node_modules" "$SOURCE/package.json" "$SOURCE/package-lock.json" "$RELEASE/"
  chown -R metadrive:metadrive "$RELEASE"
fi
test -f "$RELEASE/apps/server/dist-system/system-support/entrypoint.js"
test -f "$RELEASE/apps/server/dist-system/system-support/job-worker-entrypoint.js"

mkdir -p "$(dirname "$API_OVERRIDE")" "$(dirname "$WORKER_OVERRIDE")"
cat > "$API_OVERRIDE" <<EOF
[Service]
WorkingDirectory=$RELEASE
ExecStart=
ExecStart=$(command -v node) $RELEASE/apps/server/dist-system/system-support/entrypoint.js
EOF
cat > "$WORKER_OVERRIDE" <<EOF
[Service]
WorkingDirectory=$RELEASE
ExecStart=
ExecStart=$(command -v node) $RELEASE/apps/server/dist-system/system-support/job-worker-entrypoint.js
EOF
SWITCHED=1
systemctl daemon-reload

# API owns SQL migrations and metadata seeding. Health must pass before
# activating the worker against the upgraded schema.
systemctl restart "$API_SERVICE"
OK=0
for attempt in $(seq 1 20); do
  if curl --silent --show-error --fail --max-time 4 https://api.unesolutions.co.uk/api/health |
       grep -q '"status":"ok"'; then
    OK=1
    break
  fi
  sleep 2
done
[[ "$OK" == 1 ]]
systemctl is-active --quiet "$API_SERVICE"
systemctl show -p ExecStart --value "$API_SERVICE" | grep -F -q "$RELEASE"

systemctl restart "$WORKER_SERVICE"
# Watch for immediate runtime failures, not just a successful systemctl restart.
for attempt in $(seq 1 5); do
  sleep 1
  systemctl is-active --quiet "$WORKER_SERVICE"
done
systemctl show -p ExecStart --value "$WORKER_SERVICE" | grep -F -q "$RELEASE"

SWITCHED=0
trap - ERR
rm -f "$API_BACKUP" "$WORKER_BACKUP"
echo "Oracle API and worker deployment verified: $SHA"
