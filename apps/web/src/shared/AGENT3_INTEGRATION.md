# Agent 3 frontend/runtime integration contract (Agent 5)

Original Agent 3 changes are integrated on `main`. Finalisation uses PR #473, branch `restructure/agent3-runtime-finalization`; merge only after required checks pass.

## Existing contracts retained

- Public marketing entry remains in `main.tsx`; `App.tsx` handles session restore and authentication.
- Authenticated `setupAppShell.createSetupApp(deps)` is dynamically imported after successful authentication; it receives the same `LightningAppRuntime`, `RecordWorkspace`, Page Builder, Report Builder, and other dependencies as before.
- `pageRuntimeViews.createPageRuntimeViews(apiRequest)` initialises only after authentication; `recordWorkspaceViews.createRecordWorkspaceViews(...)` is additionally deferred until a record route opens.
- Page Builder and component property editing remain lazy. `connectorSettingsView.ConnectorSettingsWorkspace` also loads on demand.
- Direct Builder/Admin routes hydrate fresh `metadata:read`/`security:read` capabilities, including equivalent write/manage grants. Auth refresh responses arriving after logout cannot restore the previous session.
- Metadata-driven routes and server-side authorisation remain unchanged. Continue using `parseAppRoute` / `appRoutePath` and existing tenant-aware APIs; do not use client-only checks as an authorisation mechanism.

## Required Agent 5 integration validation

1. Resolve Agent 4 Builder changes against the existing named exports: `createPageBuilder`, `MetadataComponentProperties`, `ReportBuilder`. Preserve laziness and avoid any new static Builder imports into `App.tsx`, `pageRuntimeViews.tsx`, or `recordWorkspaceViews.tsx`.
2. Confirm the initial public/login bundles and an ordinary published page do **not** contain the Flow, Dashboard, or Report Builder modules. Use Vite generated bundle/chunk inspection, not assumptions based on `React.lazy`.
3. Run `npm run build --workspace @metadrive/web` from repository root and applicable frontend tests. Verify login, session restore, navigation, pages, list/detail records, Builder entry, and connector settings with Playwright.
4. Check installed/active application metadata and OneEngine server-side permissions remain authoritative for all lazy routes and APIs; verify tenant-switch and revoked-permission behaviour.
5. Check initial loading and authenticated route timings with a fresh browser cache, including mobile/responsive navigation. Record measured sizes/timings.

## Follow-up verification / deferred non-Agent-3 work

- The existing wide metadata bootstrap and large legacy runtime modules need progressive decomposition with tests. Do not introduce a separate metadata store or copy Builder code to work around imports.
- GitHub Actions on PR #473 are the source of truth for compilation and runtime regressions; no CI result should be declared successful without checking it.
