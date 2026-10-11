# MetaDrive SQL cutover — guarded execution checklist

**Status: Not approved for production.** The JSONB persistence setting remains the active default.

The v3 SQL scalar-node runtime is a temporary lossless compatibility layer for metadata, Flows, permissions and settings. Physical md_obj_* object tables exist as a verified staging projection but are **not yet authoritative for runtime business-record reads/writes**. Successful CI does not mean Salesforce-style conversion is complete.

## Before touching production

1. Freeze the target commit; pass all CI against that commit: production build, startup, dependencies, config and secret readiness, schema and integration tests, SQL CRUD/Flow/restart smoke, RBAC and mocked integrations.
2. Create a fresh full Aiven PostgreSQL backup and encrypt privately; independently restore into PostgreSQL 18, verify exact state digest and physical record projection. Existing automated backup age alone is insufficient.
3. Verify zero loss from the newest live source, field by field: objects, records, Flows (all versions and active pointers), credentials, RBAC, pages, users, sessions, schedules, and histories. Reject any mismatch.
4. Finish physical object-table runtime: immutable object and field IDs, metadata-driven column migrations, generic direct SQL CRUD and relationship constraints.
5. Benchmark realistic workloads against restored production data. GH runner timings do not predict Render-to-Aiven latency.

## Controlled cutover

1. Enable maintenance. Verify public API requests reject writes; stop background jobs, scheduled Flows, webhooks, and all other writers; retain undelivered events for idempotent replay.
2. Wait for all in-flight commits and queue flushes. Capture a final fresh backup after the freeze and verify an independent restore.
3. Apply additive migrations and copy the frozen source transactionally. Preserve original legacy state untouched during the SQL shadow migration.
4. Verify full state digest, each record ID and value, Flow/version binding, RBAC, encrypted credentials, and relationships. Reject on any mismatch.
5. Only when physical object tables and existing Flows have passed replay, explicitly enable the SQL runtime on one controlled instance. Never run uncontrolled competing writers.
6. Verify login, object/field editing, record CRUD, version activation, WhatsApp send/receive mocks, kiosk payment mocks, AppExchange licences, RBAC read/edit restrictions and page rendering.
7. Re-enable traffic, replay queued provider events idempotently and verify durable commits survive restart.

## Abort and rollback

- Abort on missing backups, checksum drift, unrecognised object/field types, privilege escalation, secrets that fail decryption, records absent after restart, lost Flow versions, webhook duplication or major latency regression.
- Roll back only after stopping writers and verifying a new backup. Preserve records and Flow changes made since initial cutover; never restore an older JSONB blob over newer SQL data without reconciliation.
- Keep all SQL and old tables for investigation. Do not drop the rollback state during cutover.

## Final acceptance

- No business record stored in JSONB or JSON files, and no in-memory-only writes.
- No hardcoded business mappings; Object Manager, metadata and Flows define them.
- Immutable SQL object/field identities through metadata renames.
- Tenant and RBAC authorisation for every SQL operation.
- Working Flows, scheduled jobs, credentials, API callouts and rollback after restart.
- Explicit final data parity and post-cutover tests before retiring legacy state.

**No automatic production cutover is performed by merging this branch.** Production cutover requires its own guarded release after every remaining item is verified.
