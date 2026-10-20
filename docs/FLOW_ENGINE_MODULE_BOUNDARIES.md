# Flow Engine module boundaries

This is a behaviour-preserving structural extraction of existing MetaDrive Flow functionality.
The published SQL Flow executor is implemented in `flow-engine/FlowEngineCore.ts`.
Draft validation and entitlement logic live in `flow-engine/FlowValidator.ts`.
Legacy `system-files` imports remain compatibility re-exports.

## Canonical target modules

- `FlowEngineCore.ts`: canonical implementation of the existing SQL-backed `FlowRuntime`.
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

## Internal module boundaries

`FlowEngineCore.ts` retains one SQL transaction-aware execution loop; this is intentional
so fault paths, savepoints, durable continuation and published Flow semantics remain
consistent. `FlowValidator.ts` retains a single shared draft validator rather than
splitting validation into competing engines. The surrounding Flow state, debug,
parser, variable, history, version and node responsibilities are separated and reused.
Do not claim that moving a module alone changes its internal algorithms or complexity.

## Verification

Run the repository `npm run check`, SQL validation and release CI.
Do not merge if either mandatory workflow fails.
