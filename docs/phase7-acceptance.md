# Phase 7 acceptance and cutover

Status: **not accepted**. Phase 7 cannot be declared complete through an audit-only PR.

Run `npm run audit:phase7` to measure tracked application and test sources without opening tenant state, secrets, or runtime data. The oversized-file list is a remediation backlog; existing legacy files are not exempt from the final architectural goal.

## Acceptance gates

- 7a: Replace remaining platform screens/routes with registered metadata instances, verify navigation parity and RBAC.
- 7b: Remove obsolete app-specific behavior from core only after dependency checks confirm package compatibility.
- 7c: Consolidate duplicated helpers and independently validate caller behavior.
- 7d: Extract oversized source/CSS into reusable modules; preserve existing routes and exports.
- 7e: Measure and verify metadata cache/offline sync, recovery and performance against real client configurations.
- 7f: Run tenant-isolation, permission, cross-device, recovery and concurrency regressions with signed-off results.
- 7g: Validate deployed Render application, SQL migrations and rollback; record owner acceptance.

Do not change runtime data, auto-delete metadata or claim cutover until these gates pass. Complete Phase 4, 5 and 6 dependencies before final acceptance.
