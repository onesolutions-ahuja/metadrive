# Flow Engine module boundaries

This is a behaviour-preserving structural extraction of existing MetaDrive Flow functionality.
The published SQL Flow executor remains in `system-files/flow-runtime.ts` until its
transactional execution method is safely split into smaller services. The large
validation implementation similarly remains under `flow-validation.ts`.

## Canonical target modules

- `FlowEngineCore.ts`: canonical compatibility entry for SQL-backed `FlowRuntime`.
- `FlowParser.ts`: SQL-backed Flow capability catalogue and validated metadata loading.
- `FlowValidator.ts`: single authoritative Flow draft validation and entitlement gates.
- `FlowStateManager.ts`: persisted interview state and continuation snapshots.
- `FlowVariableResolver.ts`: scalar resource typing and persistence conversion.
- `FlowFaultHandler.ts`: field/page Flow error contracts.
- `FlowBulkifier.ts`: delegates bounded record and collection operations to the shared Data/Record engines.
- `FlowDebugger.ts`: read-only execution simulation and debug snapshots.
- `FlowVersionManager.ts`: activation/deactivation and trigger subscription lifecycle.
- `FlowExecutionHistory.ts`: tenant-scoped, RBAC-checked Flow run history.
- `types/RecordTriggeredRuntime.ts`: record-trigger executor, extracted implementation.
- `types/ScheduledFlowRuntime.ts`: scheduled Flow dispatcher, extracted implementation.
- `types/ScreenFlowRuntime.ts`: shared SQL Flow executor with Screen handler.
- `types/AutolaunchedFlowRuntime.ts`: shared SQL Flow executor; no duplicate execution loop.
- `types/EventTriggeredFlowRuntime.ts`: shared durable event job and platform event handler.

Compatibility re-exports preserve existing module imports. Do not create separate
SQL CRUD, Flow execution, or permission engines.

## Deferred internal code splits

The large SQL `FlowRuntime` execution loop and `validateFlowDraft` remain
in their existing, oversized legacy files. These are not yet fully modularized:
a safe extraction requires preserving transaction savepoints, Flow pauses,
side effects, RBAC, SQL metadata and published behaviour. This PR does not
claim those internals are separately implemented by the new façades.

## Verification

Run the repository `npm run check`, SQL validation and release CI.
Do not merge if either mandatory workflow fails.
