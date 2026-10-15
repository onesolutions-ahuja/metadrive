# MetaDrive — Universal Metadata Transformation: 49-Step Roadmap

Execution model: seven main phases, each divided into seven subphases (a–g).
Keep **one consolidated PR per main phase**. Subphases are checkpoints within that PR, not separate merges or deployments.
All 12 Developer Policy rules apply to each subphase. Preserve tenant records and existing RBAC. No new application-specific engines.

| Phase | a | b | c | d | e | f | g |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **1 — Inventory & contract** | Tracked source/seed inventory and line baseline | Registry/component coverage and surface map | Objects, Actions, Flows, RBAC, routes inventory | Duplicate/hardcoded-path analysis | Canonical schemas and backwards-compatibility map | Migration dependency order and rollback plan | Contract tests, inventory sign-off, consolidated PR validation |
| **2 — Metadata foundation** | Extend existing registry with protected system scope | Typed properties, defaults and validation | Instance tree, slots and responsive overrides | Data binding through existing Object API | Action/Flow event binding through existing runtime | Metadata caching, versioning and recovery | Seeders, RBAC integration, compatibility and E2E tests |
| **3 — Shared UI components** | Shared primitives and accessibility | Layout/container components | Forms and property controls | Lists, tables, filters and pagination | Navigation, dialogs and feedback | Responsive/visibility conditions and editor parity | Registry seeding, security and component regression |
| **4 — Platform pages** | Setup shell/navigation | General settings and tenant settings | Object Manager | App Manager and AppExchange | User, roles, permission management | Connectors, named credentials and administration | Remaining administration pages, parity tests and cutover |
| **5 — Self-hosted builders** | Shared builder shell/toolbars | Universal property inspector | Page Builder | Flow Builder | Dashboard/Report Builders | Schema/Component Builders | System-definition publish/rollback, E2E and cutover |
| **6 — Backend convergence** | Domain route/service inventory | Generic Object/Record service convergence | Actions/Flows/scheduler convergence | Component/page metadata service convergence | RBAC/tenant isolation hardening | App package install, upgrade and seeder parity | Backend integration, concurrency and migration verification |
| **7 — Completion** | Remaining screen and route migrations | Remove obsolete app-specific core paths | Remove duplicate helpers/engines | Split legacy oversized files and CSS | Performance, caching and offline sync | Security, recovery and cross-device full regression | Deployment validation, architecture acceptance and documentation |

## Phase 1a scope
1. Build a **read-only, repeatable inventory** from `git ls-files`; do not read `platform-state.json`, tenant records, secrets or live databases.
2. Inventory tracked source by path, area and source line count, including large legacy modules.
3. Inventory checked-in platform seed Object/field counts, Flow identifiers and Page identifiers, plus registered/manifest components and workspace IDs.
4. Flag possible platform-core references to Kiosk/POS/Till/KDS for architectural review; flags are **not** automatic evidence of a defect.
5. Test inventory consistency and explicit exclusion of tenant runtime data, and run it in existing policy CI. Publish the JSON inventory as a temporary CI artifact.
6. Preserve runtime behaviour and RBAC. No new app/module is installed by this audit and no seeder or RBAC permission addition is needed.
7. Phase 1a is accepted when the audit script and tests pass in CI and its report is available. Phase 1 remains open until 1g.

## Constraints
- `apps/server/data/platform-metadata.json` is a checked-in seed snapshot, **not** live installed tenant metadata.
- Dynamically created components, Flows and pages require separately authorised tenant-safe runtime inspection in Phase 1c.
- Do not mistake static code search matches for executable route or component registrations. Verify each identified migration target before changing it.
- New modules should be cohesive, reusable and responsibility-based. Keep one consolidated PR per approved phase; avoid unnecessary fragmentation.
