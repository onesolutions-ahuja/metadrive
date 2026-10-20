# MetaDrive Flow node extraction — final architectural mapping

The source-file split preserves published SQL Flow definitions and execution behaviour.
It does not register arbitrary new Flow graph element types.

## Dedicated executable handlers

Existing Flow runtime node files: `GetRecordsNode.ts`, `CreateRecordsNode.ts`,
`UpdateRecordsNode.ts`, `DeleteRecordsNode.ts`, `RollbackRecordsNode.ts`,
`DecisionNode.ts`, `AssignmentNode.ts`, `LoopNode.ts`,
`SortCollectionNode.ts`, `FilterCollectionNode.ts`, `CountCollectionNode.ts`,
`TransformNode.ts`, `WaitPauseNode.ts`, `ResumeEventNode.ts`,
`ScreenElementNode.ts`, `SubflowNode.ts`, `CustomErrorNode.ts`,
`ActionEmailNode.ts`, `HttpCalloutNode.ts`,
`PlatformEventPublishNode.ts`, `QuickActionNode.ts`,
`ActionButtonNode.ts`, and `CustomActionBridgeNode.ts`.

`OpenPageActionNode.ts` lives under
`apps/web/src/core/pages/PageRuntime/` because page navigation is browser
behaviour. It delegates to the existing metadata-based route resolver and the
host navigator; destination APIs enforce server-side authorization.

Action Button is an adapter to the existing SQL-backed Action runtime, preserving
its RBAC checks and transaction/fault handling. Custom Action Bridge delegates
to the existing registered HTTPS External Service Action, never arbitrary code.
Resume Event delegates to the existing durable job resumer rather than creating
a second Flow engine.

Shared implementation modules `NodeContext.ts`, `RecordMutationTargets.ts`,
`ActionNodeShared.ts` and the narrow `DataActionNodes.ts` dispatcher are
not separate Flow node types. Existing import paths are preserved.

## Scope and verification

No SQL schema, tenant permission, app entitlement, Flow metadata type, URL,
or application-specific behaviour has been intentionally added or changed.
No unsafe generic script execution has been introduced.

Validate the final commit with `npm run check`, SQL smoke, dedicated Flow
tests, page-navigation tests, security/tenant-isolation checks and relevant CI.
Do not merge without passing validation.
