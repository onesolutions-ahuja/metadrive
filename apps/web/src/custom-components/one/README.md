# MetaDrive One Components — additive registration (phase 1)

The canonical component catalog lives in `manifest.json` and registers **41 components**
through the *existing* trusted bundle loader and the *existing* published SQL-backed
`libraryComponents` registry. No alternative renderer, CRUD service, Flow engine,
installation record or metadata store is introduced.

- User-visible names: `One-Card`, `One-Table`, `One-Button`, etc.
- Stable API names: `OneCard`, `OneTable`, `OneButton` (the existing registered
  component schema does not permit hyphens in API names).
- Surface availability: Page Builder, Dashboard Builder and Flow screens.
- Core components have no optional application dependency.
- Core source bundles are split by responsibility into layout, display, inputs,
  actions and data views. Metadata controls the kind, appearance, bindings,
  responsive sizes and event Flow configuration.
- All source code is signed/reviewed trusted code. Tenant-authored JSX retains
  the existing sandbox boundary. OneEngine authorisation still applies to every
  data query, mutation, Action and Flow performed by the host.
- Component business actions use host `onAction` Flow bindings. Paired state
  synchronisation uses the authenticated Flow-backed state channel; components
  do not make app-specific network calls or direct data writes.
- `OneFileUpload` selects file metadata; uploading bytes requires the existing
  authenticated host upload binding. `OneDashboardEmbed` accepts supplied
  widget data and does not fetch protected dashboards directly.
- `OneShoppingCart` is a reusable product/basket and paired-display view. Its
  fields, state Flows and action bindings come from metadata; the server-side
  Flows remain authoritative for sessions, age checks and checkout.

## Version and installation policy

Increase a descriptor's `version` when its bundled source or property
contract changes. Registration is idempotent: a trusted component is upgraded
only if the signed descriptor version is newer. Tenant-owned registrations
are never overwritten. Existing built-in and app-installed components are
untouched in this phase.

## Migration gate

The shared migration runner at
`apps/server/scripts/migrate-page-components.mjs` supports tenant-scoped Page,
Dashboard and Flow reference updates. It changes only the component API
reference and matching runtime library ID, checks the target's published
status, surface and saved property keys, and requires explicit approval and
rollback evidence per surface. Explicit mapping defaults fill only missing
properties and are checked against the target definition.

The SQL collection runner is compatible only with relational persistence.
Typed SQL metadata must be migrated through RBAC-authorized metadata APIs;
the runner refuses typed, normalized and JSONB stores. The authorized update
path must retain a tenant-scoped rollback snapshot before changing a page.
Dry-run is the default for the relational runner.

Use a disposable tenant and an exact, independently verified mapping. Include
only approved collections with `--collections` and exact metadata API names
with `--targets` when applying; a Page approval does not approve Dashboard or
Flow migration. Flow version snapshots are included so saved and active
versions continue to resolve consistently.

No legacy component, application package or stored tenant metadata is retired
or automatically remapped by registration. Preserve any component whose
properties, data bindings, events, validation, actions or responsive behavior
do not have verified parity. Retire registrations only after tenant references
and rollback protection are separately verified.

## Verification

`node --test apps/server/test/one-components.catalog.test.mjs`

Migration contracts and transactional backup/rollback behavior are tested by
`node --test apps/server/test/page-component-safe-cutover.test.mjs apps/server/test/component-migration-execution.test.mjs`.
