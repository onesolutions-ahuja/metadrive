# Phase 1 — Architecture and contract acceptance record

**Scope:** 1a–1g of the 49-step universal metadata transformation. This is an architecture, inventory and migration **baseline**, not a claim that later runtime migration is complete.

| Subphase | Evidence | Acceptance |
| --- | --- | --- |
| 1a tracked inventory | `scripts/audit-platform-architecture.mjs`, policy workflow artifact | Deterministic tracked paths, seed identities, line baseline; excludes tenant runtime state |
| 1b component/surface map | `PHASE1B_COMPONENT_COVERAGE.md`, component registry audit | Documents page, dashboard, Flow, bundled and SQL registry authorities |
| 1c Object/Action/Flow/RBAC routes | `PHASE1_ARCHITECTURE.md`, `phase1c-page-dependencies.test.mjs` | Preserves existing Object API, Flow execution and central permissions |
| 1d duplicated/hardcoded-path review | `PHASE1_ARCHITECTURE.md`, `phase1d-component-reuse.test.mjs` | Generic bindings and package-driven retirement; remaining cases mapped to later phases |
| 1e canonical schema and compatibility | `contracts/metadata-schema-compatibility.v1.json`, `phase1e-schema-contract.test.mjs` | Existing saved references and tenant-owned component behavior preserved |
| 1f dependency/rollback plan | `MIGRATION_DEPENDENCIES.v1.json`, `phase1f-migration-dependencies.test.mjs` | Six ordered, reversible later-phase gates; no destructive data rollback |
| 1g contract sign-off | `phase1g-acceptance.test.mjs`, `phase1-final-acceptance.test.mjs`, metadata architecture CI | Every artifact exists, oversized legacy code has a migration owner, tenant context and OneEngine remain the authority |

## Required CI acceptance

The `Metadata Architecture Contract` workflow checks the live repository against the migration-map ownership and executes the Phase 1f, 1g and consolidated acceptance tests. The `Developer Policy and Architecture Inventory` workflow tests and uploads the tracked-source and component inventories on every pull request and `main` push.

A passing CI run and merge of the acceptance PR constitute Phase 1 sign-off. If CI is failing, **Phase 1 is not signed off**.

## Boundaries

This sign-off **does not** mark Phases 2–7 complete, authorise SQL activation, create platform system permissions, bypass OneEngine RBAC, remove tenant data, or accept any UI/backend runtime cutover. Oversized legacy source is inventoried and assigned to Phase 7 remediation, not falsely described as fixed.
