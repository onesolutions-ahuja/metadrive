# Durable Worker: production cutover and reconciliation

This runbook is for MetaDrive's **existing** SQL durable-job foundation, not a separate job engine.

## Preconditions

1. The consolidated change is merged only after strict API audit, PostgreSQL recovery and tenant/RBAC tests, browser CI and security tests pass.
2. Confirm the active production SQL migration ledger and hashes against the release commit. Apply additive migrations using the repository's existing transactional migration runner, not manual destructive SQL.
3. Verify an Aiven database backup exists and that an authorised restore procedure has been tested on an isolated database. Never test restoration into live tenant records.
4. Confirm the Railway API service revision and current staged configuration. **Do not commit or discard unrelated staged API source changes.**
5. Confirm queued/reconciliation job counts, app installations, licences, Flow activation and operator permissions.

## Independent Railway worker

Use a separate service for the approved API commit, with no public domain.

- Repository: `onesolutions-ahuja/metadrive`; branch: `main`, pinned to the approved commit during initial cutover.
- Build: `npm run build --workspace apps/server`.
- Start: `npm run start:worker --workspace apps/server`.
- Database: use the existing approved tenant-aware `DATABASE_URL`; configure encrypted credential key variables using the same approved secret source as API, without copying secrets into logs.
- Environment: configure explicit worker identity, restart policy, one replica initially and normal health/operation monitoring.
- Increase replica count **only after** the PostgreSQL simultaneous-claim and lease-recovery tests pass.
- No web domain is required for the worker.
- Avoid deployments that implicitly apply pre-existing staged Railway API source changes.

## Crash and ambiguous external outcome

- A lease is never evidence that an HTTP request, message, print action or payment did not happen. Expired leases and handler failures are quarantined as failed work.
- Do not restart jobs by writing SQL job status or by replaying HTTP requests manually.
- Inspect the job through authenticated `GET /api/system/jobs/:id`. Review tenant, Flow version, failed execution history and any outbound receipts.
- A duplicate outbound execution key is blocked unless a permitted operator explicitly reconciles the provider receipt.
- Verify with the external provider whether the original effect occurred, using its authoritative logs/receipt. Check idempotency guarantees for the **specific provider and endpoint**, not merely the presence of an Idempotency-Key header.
- Record evidence using `POST /api/system/receipts/:id/decision` and an approved decision. Use `confirmed_not_sent` only when confirmed; use `provider_idempotent_retry` only when provider deduplication is demonstrably guaranteed; otherwise acknowledge and stop.
- Once provider evidence is recorded, an authorised operator can choose to retry/acknowledge/cancel the **failed** job using `POST /api/system/jobs/:id/decision`. A cancelled execution remains cancelled.
- Both decisions are tenant-scoped, centrally RBAC-gated and written with SQL audit records.

## Rollback

1. Disable the independent worker service first. Allow active actions to finish where possible; note all in-flight leases and unknown outcomes.
2. Roll back the API and worker to the last known-good approved code revision using Railway's deployment history. Never restore a previous DB snapshot merely to reverse an additive schema change.
3. Preserve the SQL migration ledger, existing business records and provider execution receipts. Do not delete or re-enqueue uncertain jobs during rollback.
4. For a failed schema upgrade, restore only through the documented isolated verified recovery procedure, with explicit owner approval and a separate data-safety plan.
5. Reconcile uncertain provider outcomes before restarting job processing; check tenant licences, disabled apps, Flow versions and revoked RBAC grants again.

## Evidence to retain

- GitHub release commit and successful SQL/system/browser workflow URLs.
- Isolated PostgreSQL migration checksums, crash/restart, two-worker, tenant and manual reconciliation test outputs.
- Production Aiven ledger/backup metadata and safe-restore drill reference.
- Railway worker service ID, deployment commit, startup/health logs, replicas, safe shutdown and rollback deployment ID.
- Nonsecret execution and operator audit histories, with provider evidence references where applicable.

**Never mark production worker recovery safe merely because the API deployment is healthy.**
