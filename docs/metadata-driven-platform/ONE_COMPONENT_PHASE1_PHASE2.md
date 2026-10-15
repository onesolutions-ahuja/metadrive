# One Components — Phase 1 and 2: safe baseline and mapping

## Scope and status

This phase is **read-only**. The merged PR #466 introduced 40 `One*` component definitions. This PR adds a reproducible source inventory and initial mapping **without replacing any component, altering metadata, changing tenant records or switching runtimes**.

Run `node --test scripts/audit-one-component-migration.test.mjs` and `node scripts/audit-one-component-migration.mjs --json > /tmp/one-component-inventory.json`. The report inventories all 40 component API names and explicit properties, known legacy custom components and their source-code references.

### Registry and compatibility evidence

- New source catalog: `apps/web/src/custom-components/one/manifest.json`.
- Existing custom-component catalog: `apps/web/src/custom-components/manifest.json`.
- Established registry resolver: `apps/web/src/componentRegistryLookup.ts`.
- Legacy identifiers across Pages, Dashboards and Flows: `contracts/component-reference-compatibility.v1.json`.
- Existing architecture/registry audit: `scripts/audit-component-registry.mjs`.
- Existing validation: `apps/server/test/one-components.catalog.test.mjs` and `apps/server/test/component-registry-sql.integration.test.mjs`.

The new audit supplements existing tools; it does **not** introduce another component registry or renderer.

### Preliminary compatibility candidates (NOT approved migrations)

| Existing component | Candidate One components | Status |
|---|---|---|
| SystemPanel | OneCard, OneText | Manual review: protected system presentation |
| AdminField | OneInput, OneSelect | Manual review: administration field semantics |
| ChatterInbox | OneList, OneTable | Manual review: conversations, assignments, Flows |
| CustomerBasketDisplay | OneCard, OneTable | Manual review: basket interaction/binding |
| RecordCatalogCart | OneTable, OneCard | Manual review: record selection and cart semantics |

These are composition candidates, **not** one-to-one replacements. The script includes only components present in the legacy manifest; other historical/built-in component types must be inspected before adoption.

### Phase 1 completion gates

1. Run catalog, compile/SSR, SQL registry and tenant-idempotence tests on the current head.
2. Confirm new source and published SQL component definitions agree for representative tenants and all three surfaces.
3. Verify that legacy definitions, tenant-owned components and published pages still work.
4. Resolve the long-running isolated PostgreSQL job before declaring full backend validation passed.
5. Verify RBAC and app licensing/activation separately from renderer registration.

### Phase 2 completion gates

1. Run source inventory and export an **authorised read-only tenant-aware SQL report**, including `tenant_id`, component API name, publish version, surface, and count of references in published/draft Page, Dashboard and Flow metadata. Do not expose tenant business-record data.
2. Include references via aliases, dynamic bindings, component instance IDs and version history that string matching misses.
3. Record each mapping's properties, events, bindings, validation, responsive behaviour, accessibility, permissions and nested children. Reject mappings lacking functional parity.
4. Identify gaps; extend the existing shared property/registry/renderer engines, not an app-specific alternative.
5. Take recoverable metadata snapshots before any future migration; preserve IDs and existing versions. Require explicit tenant-by-tenant approval for migration, test draft/publish and rollback.

**No automatic replacement is authorised by this phase.** Existing tenants and installed apps continue to use their saved component references. SQL is authoritative for live usage; a static source scan cannot establish zero active references.
