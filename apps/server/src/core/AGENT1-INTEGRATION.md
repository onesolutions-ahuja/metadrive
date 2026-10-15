# Agent 1 backend Core integration handoff

Branch: `restructure/agent1-backend-core`

## Integrated in existing runtime
- `modules/records/query-page.ts` exports `filterAuthorisedRecords`, `orderAuthorisedRecords` and `pageAuthorisedRecords`.
- `modules/records/routes.ts` already imports both; HTTP endpoints and shape are unchanged.
- Search/filter/sorting MUST happen only after object access, record sharing, field visibility, filter and sort-field authorisation. These helpers intentionally accept authorised records only.
- `test/agent1-record-query.test.ts` is an explicit targeted test: `npx tsx --test apps/server/test/agent1-record-query.test.ts`.

## Agent 5 wiring responsibilities (not implemented here)
- Keep the existing `registerRecordRoutes(deps)`, `registerObjectMetadataRoutes(deps)`, `registerComponentLibraryRoutes(deps)`, `registerAuthenticationRoutes(deps)`, `createAccessAuthentication(deps)` calls as the single routes path. Do not register parallel endpoints.
- `index.ts` remains the runtime composition root pending Agent 5 extraction. In particular, the injected `tenantData`, `getPrincipal`, `hasObjectPermission`, `hasRecordAccess`, `hasFieldPermission`, `sanitizeRecordForRead` and persistence hooks must remain authoritative.
- Preserve request-time token validation, tenant-domain checks, disabled-tenant/user checks and dynamic effective RBAC in `createAccessAuthentication`; avoid accepting token-embedded grants.
- Keep SQL commit acknowledgement before successful mutation responses and never replace the OneEngine permission checks with UI-only visibility or cache-only decisions.
- After extracting bootstrap, remove moved declarations from `index.ts` rather than maintaining a second path.

## Pending Agent 1 work
Broader CRUD validation and relationship service consolidation, component/page metadata and Flow runtime extraction, duplicate elimination, cross-module interfaces and running repository CI are **not complete**. Do not treat this handoff as architecture sign-off.

## CI status
The checked GitHub Actions workflows do not trigger on push to this branch. As of this handoff GitHub reports zero workflow runs for this branch. The available GitHub connector permits reading and rerunning existing jobs but does not expose `workflow_dispatch`. A manual run of `metadrive-checks.yml` against this branch from GitHub Actions UI, or an owner-approved PR, is needed to execute the full build and test workflow. Do not interpret missing CI checks as passing checks.
