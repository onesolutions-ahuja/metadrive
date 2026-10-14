# Universal Metadata Transformation — Phase 1 Architecture Contract

Status: proposed implementation baseline; no runtime cutover is authorised by this document.

## Existing architecture
- React/Vite frontend: `apps/web/src/App.tsx`, registered component renderer, component registry lookup, page/Flow/dashboard builders.
- Express API: `apps/server/src/index.ts`, modular Object/Record/Security/Flow services.
- PostgreSQL-backed tenant metadata and records; legacy platform-state projection/restore modules.
- Existing component definitions support API name, surfaces (page/dashboard/flow), resize, version, published/draft state, and compiled code. Component instance properties and visual schemas are handled separately.
- Existing Actions, Flows, Object APIs and RBAC must remain authoritative; do not create parallel runtimes.

## Verified file-size baseline (main branch at audit)
| File | Lines |
| --- | ---: |
| apps/web/src/App.tsx | 12,887 |
| apps/server/src/index.ts | 15,830 |
| apps/web/src/DashboardBuilder.tsx | 3,016 |
| apps/web/src/FlowBuilder.tsx | 1,586 |
| apps/web/src/metadata.ts | 1,350 |
| apps/server/test/rbac-sharing.smoke.test.ts | 5,542 |
| apps/web/src/styles.css | 2,670 |

The full inventory must cover all source, test, CSS, generated, and migration files before the cutover. Split modified oversized files by responsibility; never create new oversized files.

## Canonical contracts to formalise (reuse existing metadata)
1. **ComponentDefinition**: API name, owner/scope, supported surfaces (including protected system surfaces), version, publication status, capabilities, typed property schema, event schema, bindings, resize and responsive defaults. Existing LibraryComponentMetadata must be evolved compatibly.
2. **ComponentInstance**: stable ID, definition reference/version policy, parent/slot, instance property values, responsive overrides, visibility conditions, data binding, event-to-Action/Flow bindings.
3. **PageDefinition**: API name, kind, owner/scope, component tree, route/navigation metadata, publication state, RBAC reference, device layout.
4. **ActionBinding**: event name, existing Action/Flow identifier, typed inputs, context bindings, result/error handling, server-side permission checks.
5. **DataBinding**: existing Object API, metadata-defined field/filter/sort/pagination/relationship references; permission-filtered records.
6. **SystemDefinition**: protected, versioned platform-owned metadata with explicit tenant override boundaries and recovery/rollback capability.
7. **PackageManifest**: versioned idempotent seeders for objects, components, pages, Actions, Flows, navigation and initial OneEngine grants; preserve admin overrides.

## Migration order and gates
- First prove an existing registered component can render on one protected system page without a second renderer.
- Then unify property schema and editor; keep old metadata readable until migrated.
- Convert platform settings, Object Manager, App Manager, tenant/RBAC administration; then builders.
- Finally remove app-specific rendering paths and redundant state handling after parity tests.
- No metadata can grant permissions; server-side RBAC and tenant isolation are always enforced.
- Draft/publish/rollback and last-known-good bootstrapping are mandatory before self-editable builder pages.
- No runtime cutover until CI, tenant/RBAC regressions, browser parity and recovery tests pass.

## Subphases and acceptance

See [the 49-step roadmap](universal-metadata-49-step-roadmap.md). Phase 1a adds a read-only repository/seed-definition inventory, its tests and CI report. Phase 1b–1g will complete dynamic metadata, routes, duplication, contracts, migrations and consolidated validation. Keep these in one Phase 1 PR.

## Phase 1 acceptance checklist
- [x] Review existing repository boundaries and reusable metadata infrastructure.
- [x] Establish a canonical target contract and protected system-metadata boundary.
- [x] Capture measured oversized-file baseline and migration order.
- [ ] Enumerate every component, page, Action, Flow, system route and duplication cluster programmatically. Phase 1a inventories checked-in definitions; later subphases handle dynamic definitions, routes and duplicates.
- [ ] Add executable metadata contract and compatibility tests. Phase 1a adds inventory tests; schema and compatibility tests follow.
- [ ] Validate CI and merge the consolidated Phase 1 PR.

The remaining unchecked items must be completed before declaring Phase 1 finished.
