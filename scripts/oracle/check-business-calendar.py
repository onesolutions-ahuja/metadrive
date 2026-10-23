#!/usr/bin/env python3
"""Read-only bridge to inspect a calendar from the live OCI API's SQL connection.

The process runs with sudo only long enough to read the actual systemd MainPID
environment. Node/SQL execution takes place as the unprivileged GitHub runner.
Never print the connection string, credentials, hostnames or SQL payloads.
"""
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

TARGET_PATTERN = re.compile(r"^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$", re.I)
# pg also honours PG* fallback variables when DATABASE_URL omits those settings.
# Preserve the running API's client configuration; values are never logged.
ALLOWED_KEYS = ("DATABASE_URL", "METADRIVE_DB_NAME_OVERRIDE", "METADRIVE_DB_CA_CERT",
                "PGSSLMODE", "PGSSLROOTCERT", "PGSSLCERT", "PGSSLKEY",
                "PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGPASSWORD")

def main():
    if len(sys.argv) != 2 or not TARGET_PATTERN.fullmatch(sys.argv[1]):
        raise SystemExit("A valid tenant UUID is required")
    uid = int(os.environ.get("SUDO_UID", "-1"))
    gid = int(os.environ.get("SUDO_GID", "-1"))
    if uid < 1 or gid < 1:
        raise SystemExit("Requires sudo from a non-root Oracle runner")
    root_dir = Path.cwd().resolve()
    script = root_dir / "scripts/oracle/business-calendar-readonly.mjs"
    if not script.is_file() or script.is_symlink():
        raise SystemExit("Diagnostic source is unavailable")
    process = subprocess.run(
        ["systemctl", "show", "metadrive-api.service", "--property=MainPID", "--value"],
        check=True, capture_output=True, text=True, timeout=10
    )
    pid = process.stdout.strip()
    if not pid.isdigit() or int(pid) <= 1:
        raise SystemExit("Production API process is not running")
    connection_env = {}
    with open(f"/proc/{pid}/environ", "rb") as source:
        for entry in source.read().split(b"\0"):
            if b"=" not in entry:
                continue
            key, value = entry.split(b"=", 1)
            if key.decode(errors="ignore") in ALLOWED_KEYS:
                connection_env[key.decode()] = value.decode(errors="replace")
    if not connection_env.get("DATABASE_URL"):
        raise SystemExit("Live API process has no DATABASE_URL; database not inspected")
    node = shutil.which("node")
    if node is None:
        raise SystemExit("Node runtime unavailable")
    # Do not inherit arbitrary live service variables or any sensitive env values.
    env = {
        "PATH": os.environ.get("PATH", "/usr/bin:/bin"),
        "HOME": os.environ.get("SUDO_HOME", "/tmp"),
        "NODE_ENV": "production",
        **connection_env,
    }
    # Drop root identity before any Node code or database work is invoked.
    os.setgroups([])
    os.setgid(gid)
    os.setuid(uid)
    if os.geteuid() != uid:
        raise SystemExit("Privilege drop failed")
    print("Live OCI SQL calendar diagnostic (read-only)", flush=True)
    outcome = subprocess.run([node, str(script), sys.argv[1]], env=env,
                             cwd=root_dir, timeout=45, check=False)
    if outcome.returncode:
        raise SystemExit("Read-only SQL inspection failed (details above)")
    print("SQL inspection finished without changes", flush=True)

if __name__ == "__main__":
    main()
