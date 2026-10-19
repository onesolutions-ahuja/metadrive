# Flow Phase 5 — Durable orchestration and recovery

## Setup / authoring

1. In Setup → Flows, create a **Flow Orchestration**. The SQL capability catalogue (tenant entitlement and activation checks) determines whether the type and elements can be created and validated.
2. Insert an **Orchestration Stage**. Choose an approved Object and record reference. Use either an active reusable Approval Process or 1–50 tenant approvers, select **Any** or **All**, and optionally choose a Text status output variable.
3. Connect the required **Approved** and **Rejected** outcomes to distinct steps, another stage or End. The graph editor can automatically create missing End paths, but the server validates exact connector labels.
4. Check, save and activate. Runtime approval submission revalidates tenant ownership, object and record permissions, approver identity, and OneEngine RBAC. A stage is durably paused in SQL; no browser timer is required.
5. Approvers act in the existing inbox. **Any** is approved on the first approval, rejected once no approval is possible. **All** approves only after every approver approves, and rejects on the first rejection.
6. Once terminal, the approval decision transaction stores the stage result, cancels outstanding requests and queues a single shared durable **flow.resume** job. The job rechecks active Flow/version, tenant/user permissions and app entitlement before resuming.
7. In **Paused and Waiting Interviews**, cancel work to prevent resumption. The cancellation cancels waiting stage requests and queued resume jobs while preserving the SQL run history.
8. Tenant administrators can inspect failed jobs and explicitly acknowledge or retry them via the **existing** Job Administration API and the Pending Work recovery panel. A potentially delivered action may require manual reconciliation; no ambiguous retries occur silently.

## Scheduling and recovery

* Once, Daily, Weekly and Monthly calendar schedules continue to use the shared SQL dispatcher with timezone-aware due times. Keyset pagination scans at most 20,000 entries per dispatcher iteration in bounded batches, instead of blocking all tenants above 500 active schedules.
* SQL durable jobs use leases and idempotency keys. Ambiguous or expired leases stop for operator reconciliation, not automatic replay of side-effecting Flows.
* Approval-stage resumption uses the same durable worker, no separate orchestration worker, and no new CRUD engine.

## Metadata/security design

* Orchestration stage state is relational SQL with tenant, run, element, group, rule, status and timestamps. No monolithic JSON state.
* Core Flow/Action runtime, OneEngine RBAC, tenant-scoped approvals, records and durable jobs are reused.
* Builder-only code is lazily loaded. Runtime and app-specific seeders remain independent.
* Baseline-only registry migration enables orchestration without overwriting administrator-customised capabilities or existing published graphs.

## Validation contract

Tests cover ANY/ALL aggregation, tenant-scoped SQL, decision idempotency, cancellation, browser graph Approved/Rejected insertion, real browser-to-SQL approval lifecycle, and 501-schedule dispatch across keyset pages. Required release gates include SQL migrations/schema smoke, Core builds, frontend visual checks and the actual browser SQL Flow smoke.
