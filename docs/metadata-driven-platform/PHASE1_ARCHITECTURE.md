# Phase 1/7 — Universal Metadata Architecture Baseline

Status: architecture and migration contract only. No runtime conversion is performed in Phase 1.
Baseline: main commit 2476e989a60915b4540c13b8630d46d109d73b44 (14 October 2026).
Canonical machine-readable deliverables: contracts/metadata-self-hosting.v1.json and docs/metadata-driven-platform/MIGRATION_MAP.v1.json.

## Goal and non-negotiable decision

MetaDrive's own platform pages must be built from exactly the same registered Components, properties, Objects, Actions, Flows, Pages, and RBAC as customer applications. The existing React component host, Object APIs, Flow engine and RBAC are authoritative. We will extend these, not create another renderer, data API, metadata store or execution engine. A minimal framework runtime remains code: React element rendering, PostgreSQL drivers, secure authentication, authorisation, Flow execution, cache, bootstrap and recovery.

All 13 developer policy rules apply. A requirement conflicting with any rule is escalated to the project owner before implementation. Phase 1 introduces no new app/module and therefore does not seed a new app or grant privileges.

## Inspected current architecture

| Existing authority | Current file | Decision |
| --- | --- | --- |
| Component host / sandbox | apps/web/src/RegisteredComponent.tsx | Reuse published and sandboxed component execution |
| Component lookup | apps/web/src/componentRegistryLookup.ts | Extend existing surface enum to platform in Phase 2 |
| Property definitions | apps/web/src/componentProperties.ts and metadataAppearanceSchema.ts | Consolidate into registered reusable property metadata in Phase 3 |
| Page / component model | apps/web/src/metadata.ts | Extend existing types; retain saved page and instance identifiers |
| App navigation | apps/web/src/appNavigation.ts | Drive system and app navigation from page/app metadata |
| Action / Flow bindings | apps/web/src/pageComponentBindings.ts | Retain metadata actionFlows and filtered record binding semantics |
| Object API | apps/server/src/modules/objects/routes.ts and modules/records/routes.ts | Keep generic APIs, field and record security |
| RBAC | apps/server/src/modules/security/metadata-routes.ts | Server enforcement and platform/tenant privilege separation |
| Package management | apps/server/src/installable-app-packages.mjs | Existing install/upgrade machinery, not a new installer |
| State registry | apps/server/src/platform-state-registry.mjs | Preserve persisted shape until compatible migration |

Measured baseline oversized files: App.tsx 12,886 lines; server index.ts 15,829; DashboardBuilder.tsx 3,015; FlowBuilder.tsx 1,585; metadata.ts 1,349; styles.css 2,669; rbac-sharing.smoke.test.ts 5,541. The 14 October 2026 audit counted 330 scanned source files and 10 above the line limit, all assigned a migration owner. The complete live inventory (not just these examples) is produced by scripts/metadata-architecture-audit.mjs. Any touched code file must be reduced to at most 1,000 lines; untouched legacy files are tracked for phased extraction, never silently exempted.

### Existing reuse that must not be replaced

- RegisteredComponent compiles only trusted bundled components and otherwise routes custom components through ComponentSandbox.
- The lookup uses the published registry by API name and surface, rather than hardcoded imports for each component.
- Existing visual appearance schemas already generate several property controls from arrays.
- Server routes have begun extraction under modules/objects, modules/records, modules/security, modules/flows and modules/pages.
- The platform-state registry already iterates tenant metadata without special-casing applications.

### Observed gaps

- LibraryComponentMetadata currently supports page, dashboard and flow surfaces; platform pages are still special.
- App.tsx contains direct platform workspace JSX and a Kiosk-specific display condition. Do not reproduce this pattern for new apps.
- Property editing is partly generic but schema registration, versioning and persistence are not yet unified for all components.
- Main web and server files and some test/styles files exceed the 1,000-line limit.
- Platform-level settings and privilege enforcement must not become writable just because their forms are metadata-rendered.
- Existing state, navigation, deep links, offline caches, installed packages and permissions must be migrated in place.

## Canonical contract (no parallel engine)

The JSON contract defines additions to existing metadata, not a second storage schema: registered component surfaces include the future platform surface; page definitions gain protected ownership and versions; instance properties use shared schemas; data bindings reference existing Objects; events reference existing Actions/Flows; existing RBAC remains the authority. Extensions should be additive to current schemas, with migration validators and server-side checks.

### Metadata ownership and precedence

1. Resolve verified principal, tenant, route and server-side permissions first.
2. Fetch published tenant-owned definition or an explicitly allowed system presentation override.
3. Merge only permitted appearance/layout overrides onto immutable published system metadata.
4. Reject tenant attempts to override protected platform logic, security, credentials or privileged Actions.
5. Fallback to last-known-good published system definition or a minimal secure bootstrap/recovery UI.
6. Audit publication, permission, schema version and rollback changes.

OneEngine initial permission grants apply to apps/modules through idempotent seeders. They do not grant tenant users global platform-operator privileges, and re-installing must not overwrite administrator changes.

### Component events and data operations

The component renderer receives validated typed property values, record bindings and Action/Flow event references. The generic Action/Flow interpreter executes operations and HTTP callouts through existing server services. Component JS should never contain POS, Kiosk, settings-specific business rules, embedded access keys or direct privileged API shortcuts. CRUD uses shared Object API; filters respect field and record security.

### Reliability and performance

Use one batched metadata load per page/workspace with cache keys incorporating tenant, scope, role/permission revisions, published metadata version and component registry revision as appropriate. Invalidate on publish, permission changes and tenant upgrades. Do not cache privileged data across tenants. Preserve offline-friendly published metadata without treating offline cache as permission authority. Protect recovery and sign-in bootstrap from circular dependencies on editable system pages.

## Phase 1c — Existing Object / Action / Flow / RBAC / Route integration (implementation)

Rather than repeat a repository-wide audit, Phase 1c fixes the existing `inspectPageDependencies` service in `apps/web/src/pageDependencies.ts`, using the **actual** `resolvePageActionRoute` contract and the already-loaded metadata. This is a compatibility-preserving UI dependency diagnostic, not a new execution or permission engine.

| Existing authority | Concrete route / service | Existing enforcement and decision |
| --- | --- | --- |
| Object definitions | `modules/objects/routes.ts` and `GET /api/metadata/objects` | Reuse `metadata:read` and existing object-management permissions; no app-specific CRUD |
| Record data | `modules/records/routes.ts`, `/api/records/:objectName` | Reuse authenticated tenant context and `hasObjectPermission`, plus field/record policies |
| Component Action bindings | `PageComponentRuntime` in `App.tsx`, `properties.actionFlows` | Existing page events resolve to Flow execution or Navigation; no new Action endpoint |
| Flow definitions | `GET /api/metadata/flows` | Reuse `metadata:read`; active Screen/Autolaunched Flow options validated by existing builder |
| Flow execution | `POST /api/flows/:apiName/execute` | Reuse `accessAuthentication`, `flows:run`, tenant-scoped lookup and Flow input validation |
| RBAC | `modules/security/metadata-routes.ts` | Read `security:read`; mutation `security:manage`; tenant RBAC cannot grant `platform:*` |
| Navigation | `pageActionRouting.ts`, `routeDirectory.ts`, `appNavigation.ts` | Existing stored Object/App Page references, app membership and active page status; final destination access checked server-side |
| Page dependencies | `apps/web/src/pageDependencies.ts` | **Fixed in 1c**: current navigation keys, generic Object bindings, active supported Flows, contextual destinations; diagnostics do not authorise access |

Regression tests are in `scripts/phase1c-page-dependencies.test.mjs` and run through the existing `npm run test:page-routing` build gate. An omitted app context is now represented as `Contextual` rather than incorrectly claiming access; the checker still never replaces server RBAC.

**Scope adjustment requested by owner:** Preserve the 49 development subphases but stop serial re-auditing. 1c onward should reuse existing findings and make narrow implementation/contract improvements with relevant tests. The published platform surface and expanded metadata property definitions are still Phase 2–3 work.

## Phase 1d — Remove component-name dependencies from shared code

Phase 1d replaces two concrete platform-specific branches without introducing a new
engine or doing another repository-wide audit:

- **Page Builder palette** now infers only generic Layout/Display/Inputs/Data/Navigation
  categories through one shared rules array; app-specific Kiosk and Till categories
  are no longer built into the palette. Existing components remain available under
  All Components and their inferred generic group.
- **Page component data binding** recognises any configured `*ObjectApiName` string
  property, so new business apps do not require adding new key names to the platform.
- **Trusted bundled component retirement** is driven by
  `retiredTrustedComponentPrefixes` in the existing installation catalog, not a
  Kiosk/Till regex in the shared loader. The existing historical retirement rules
  are preserved as versioned package metadata. Tenant-owned/modified definitions
  remain untouched; entitled active descriptors are not retired.
- Existing generic rendering, Object APIs, Flow execution, sandbox and OneEngine RBAC
  remain authoritative. No app/module is newly installed; no privileges are seeded.
- New focused tests cover generic categorisation/bindings and package-driven
  retirement. Phase 2–3 will replace fallback naming heuristics with database-backed
  component category/property definitions rather than inventing another registry.

## Phase-by-phase migration boundary

1. Phase 1 (this PR): inventory, canonical contract, migration map, audit command, contract tests and CI. No customer-facing behaviour change.
2. Phase 2: extend existing registry/state with scope, publishing, cache and system page seeding. Prove one representative system page via existing renderer.
3. Phase 3: standardise registered primitive components and database-defined property schemas, preserving sandbox and custom component isolation.
4. Phase 4: progressively migrate settings, navigation, administration, Object Manager, App Manager, tenant and RBAC screens. Keep protected authorisation.
5. Phase 5: self-host Page/Flow/Dashboard/Report/Schema/Component builders; specialist canvas algorithms remain generic reusable runtime code.
6. Phase 6: finish unified backend execution, package installation, OneEngine grant seeding and app-specific branch removal; preserve tenant boundaries.
7. Phase 7: finish remaining public/login and legacy UI migration where appropriate, delete obsolete paths, split oversized files, validate deployed behaviour and retire compatibility mode.

No later phase may declare completion with a partial migrated screen, untested RBAC change or unresolved file-size violation for newly changed code.

## Exact Phase 1 acceptance gates

- Every owner and target phase in the machine-readable migration map points to a current repository file.
- A single versioned contract identifies authoritative pre-existing engines and safe extension points.
- A repeatable audit enumerates all code files and reports legacy over-limit files, and CI rejects any over-limit file lacking a migration owner.
- Contract tests verify source references, security invariants, ownership and phase mapping.
- CI executes audit and contract tests without database migrations, deployments or external services.
- No runtime, tenant records, grants, routes or customer-facing behaviour is changed in this phase.

## Commands

node scripts/metadata-architecture-audit.mjs
node scripts/metadata-architecture-audit.mjs --json
node scripts/metadata-architecture-audit.mjs --check
node --test scripts/metadata-architecture-contract.test.mjs

Phase 1 does **not** certify E2E behaviour or complete conversion. Each later phase must include its own implementation and regression proof.
