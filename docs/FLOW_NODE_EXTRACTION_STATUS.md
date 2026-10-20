# MetaDrive Flow node extraction — scope and acceptance

This document accompanies the non-behaviour-changing Flow runtime decomposition.
It does not claim a newly supported Flow capability.

## Executable node modules extracted

- `GetRecordsNode.ts`
- `CreateRecordsNode.ts`
- `UpdateRecordsNode.ts`
- `DeleteRecordsNode.ts`
- `RollbackRecordsNode.ts`
- `DecisionNode.ts`
- `AssignmentNode.ts`
- `LoopNode.ts`
- `SortCollectionNode.ts`
- `FilterCollectionNode.ts`
- `TransformNode.ts`
- `CountCollectionNode.ts`
- `WaitPauseNode.ts`
- `ResumeEventNode.ts`
- `ScreenElementNode.ts`
- `SubflowNode.ts`
- `CustomErrorNode.ts`
- `ActionEmailNode.ts`
- `HttpCalloutNode.ts`
- `PlatformEventPublishNode.ts`
- `QuickActionNode.ts`

Shared, non-node modules under `nodes/` are `NodeContext.ts`,
`RecordMutationTargets.ts`, `ActionNodeShared.ts`, and
`DataActionNodes.ts`. The last is a narrow compatibility dispatcher,
not a second Record Engine. Existing import paths remain compatibility exports.

## Three requested names requiring separate capability decisions

`CountCollectionNode.ts` is now an executable bounded collection-count operation.
`ResumeEventNode.ts` extracts the existing durable-job resume path without making it a graph element.


| Proposed file | Existing runtime ownership / reason not extracted |
| --- | --- |
| `ActionButtonNode.ts` | Button components/events live in the shared Component/Action systems, not in the SQL Flow graph runtime. A button may invoke a Flow without becoming a new Flow node type. |
| `OpenPageActionNode.ts` | Navigation is a browser Page/Action runtime behaviour, not a server-side Flow element; invoking it needs an explicit published UI/action contract. |
| `CustomActionBridgeNode.ts` | No generic, authorised arbitrary-code bridge is registered. Implementing one requires an approved extension contract, tenant-scoped RBAC, isolation, auditing and packaging. |

Do not create empty files, unsupported node registrations, parallel CRUD engines,
or runtime permission shortcuts to satisfy the directory diagram.

## Verification and merge gate

Maintain existing SQL Flow graph node type strings, persisted metadata, execution
context, tenant/RBAC enforcement, savepoints, fault connectors, idempotency,
durable scheduling, pause/resume semantics and public APIs.

Run `npm run check`, targeted Flow tests, SQL smoke, published Flow runtime checks,
tenant-isolation/permissions checks, and CI. Only merge on validated success.
