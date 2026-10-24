#!/usr/bin/env python3
"""Fixed-operation, systemd socket-activated MetaDrive broker.

No shell or caller-selected paths. This process executes as root only for the
lifetime of a single Unix socket connection. The API remains NoNewPrivileges=yes.
"""
import json
import subprocess
import sys

ALLOWED = {"status", "logs", "restart", "activate_release", "mail_diagnostic"}
SERVICES = {"api", "worker"}
MAX_INPUT = 1024

def run(argv, timeout=12):
    p = subprocess.run(argv, capture_output=True, text=True, timeout=timeout, check=False,
                       env={"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8"})
    if p.returncode:
        raise RuntimeError("Operation failed (exit code %d)" % p.returncode)
    return p.stdout[:200000]

def main():
    line = sys.stdin.buffer.readline(MAX_INPUT + 1)
    if len(line) > MAX_INPUT or not line.endswith(b"\n"):
        raise ValueError("Invalid request length")
    req = json.loads(line)
    if not isinstance(req, dict) or set(req) - {"action", "service", "release"}:
        raise ValueError("Invalid request")
    action, service, release = req.get("action"), req.get("service", "api"), req.get("release")
    if action not in ALLOWED or service not in SERVICES:
        raise ValueError("Unsupported operation")
    if action == "mail_diagnostic":
        if release is not None:
            raise ValueError("Unexpected release")
        # Never reveal container environment, mounts, logs or mailbox content.
        output = ("=== listeners ===\n" +
                  run(["/usr/bin/ss", "-lnt"]) +
                  "\n=== containers ===\n" +
                  run(["/usr/bin/docker", "ps", "--format", "{{.Names}} {{.Status}} {{.Ports}}"]))
    else:
        if (action == "activate_release") != (release is not None):
            raise ValueError("Invalid release")
        if release is not None:
            if not isinstance(release, str) or len(release) != 40 or any(c not in "0123456789abcdef" for c in release) or service != "api":
                raise ValueError("Invalid release")
        output = run(["/usr/local/sbin/metadrive-mcp-operations", action, service] + ([release] if release else []))
    sys.stdout.write(json.dumps({"output": output}) + "\n")
    sys.stdout.flush()

if __name__ == "__main__":
    try:
        main()
    except Exception:
        # Fail closed; no sensitive subprocess stderr leaks to caller.
        sys.stdout.write('{"error":"Broker operation failed"}\n')
        sys.stdout.flush()
        sys.exit(1)
