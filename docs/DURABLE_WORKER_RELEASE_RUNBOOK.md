# Durable worker release and recovery runbook

## Preconditions
This feature is on a draft branch until SQL migrations, OneEngine permissions, app isolation and strict frontend/API contracts are validated. Do **not** deploy just because a branch build passes.

1. Back up tenant SQL data and verify restore in a separate database.
2. Run `npm run check`, `npm run build --workspace apps/server`, and the SQL System Validation workflow.
3. Validate migration checksums, typed projection backfill, and seeded tenant RBAC in PostgreSQL.
4. Validate two-tenant denial cases, inactive/uninstalled apps, expired entitlements, deactivated/re-published Flows, and Flow execution after permission revocation.
5. Verify `DATABASE_URL` and certificate settings reach the worker through the deployment secret manager, not source code.

## Separate worker service
Run the API server and SQL worker as separate services. Build command:
`npm run build --workspace apps/server`.
Worker start command:
`npm run start:worker --workspace apps/server`.
The worker runs the shared SQL migrations, scans active Scheduled Flow subscriptions, and polls durable jobs and queued Flow email with `METADRIVE_WORKER_POLL_MS` (default 5000). Scheduled Flow occurrences and record-triggered Scheduled Paths use the same durable job table with tenant, actor, active Flow version and an idempotency key. Scheduled Path interviews and their resume jobs are created in the triggering record transaction; record updates cancel and replace not-yet-resumed paths. Flow email payloads are encrypted in `md_flow_email_jobs`; SMTP dispatch rechecks the active Flow version, actor, tenant app entitlement and `Email:send`/`NamedCredential:read` grants. One process may handle multiple tenants only because every job carries an immutable tenant ID and every handler revalidates OneEngine RBAC and app licences.

Do not change existing production service or apply unrelated staged platform changes during verification. Before launch, confirm deployment SHA/branch and service inventory, and verify the worker is healthy rather than relying on API health alone.

## Reconciliation
An expired lease for `flow.execute` or `flow.resume` is an **unknown outcome**, not a safe retry. It is marked failed with `FLOW_RECONCILIATION_REQUIRED`. Use `GET /api/jobs/:id` with FlowDefinition.manage to review the status. Correlate SQL Flow runs, event logs and the external provider's idempotency key/receipt before taking action.

`POST /api/jobs/:id/reconcile` accepts `{ "decision": "acknowledge" | "retry", "reviewedExternalEffects": true }`. The actor must be authenticated and authorized to manage Flows in that tenant. A retry is a conscious operator decision and can repeat external side effects; choose it only after confirming the previous effect did not happen. An acknowledgement cancels the failed job without destroying business records.

Flow email is intentionally single-attempt. A failure after calling SMTP is
recorded as `DELIVERY_OUTCOME_UNKNOWN`; SMTP may have accepted the message even
when the client observed an error. Do not automatically requeue or retry these
messages. Correlate the Flow run/job ID with the SMTP provider's delivery logs
and obtain operator approval before any separately managed resend. The Flow
email outbox does not use the generic durable-job reconciliation endpoint.

External HTTP, webhook, OAuth/federation, and SMTP attempts also create
tenant-scoped Communication records with status, endpoint/provider, timing, and
byte counts. Credentials, headers, and generic request/response bodies are not
copied by default; explicitly mapped business messages may populate their
Communication fields. SMTP records omit recipient addresses and email content.
Communication record creation is decoupled from provider results. Failed
record writes remain in a tenant-scoped SQL outbox for retry by the API server
and durable worker; monitor pending rows in
`md_communication_delivery_outbox`. If SQL is unavailable before an outbox row
can be created, inspect sanitized server diagnostics for
`Integration Communication write failed`; that attempt cannot be recovered
from the outbox.

## Rollback and monitoring
Rollback deployment code and worker independently, while preserving the additive SQL schema and all tenant records. Do not manually drop durable job/outbox tables or typed `md_record_values` columns to roll back code. Track queued/leased/failed jobs by tenant, `FLOW_RECONCILIATION_REQUIRED` and `DELIVERY_OUTCOME_UNKNOWN` counts, lease expiry, actor revocation, app uninstall, and retries. Do not log tokens, email payloads, recipients, or tenant data.

## Unmet release conditions
Strict UI/API parity must have zero *genuinely missing* supported contracts, with authenticated E2E coverage. The compatibility baseline is not proof of working endpoints. The worker's fail-closed recovery is not the same as exactly-once external delivery. Production deployment and live SQL migration execution require separately verified results.
