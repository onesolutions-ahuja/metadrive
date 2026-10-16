# MetaDrive One Components — additive registration (phase 1)

The canonical component catalog lives in `manifest.json` and registers **40 components**
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
- New component events only notify the host through `onAction`; they do not
  perform app-specific network calls or data writes.
- `OneFileUpload` selects file metadata; uploading bytes requires the existing
  authenticated host upload binding. `OneDashboardEmbed` accepts supplied
  widget data and does not fetch protected dashboards directly.

## Version and installation policy

Increase a descriptor's `version` when its bundled source or property
contract changes. Registration is idempotent: a trusted component is upgraded
only if the signed descriptor version is newer. Tenant-owned registrations
are never overwritten. Existing built-in and app-installed components are
untouched in this phase.

This is **the new library preparation phase only**. Do not remove legacy
components or remap existing page, dashboard or Flow metadata until a tested
migration with compatibility aliases has been approved.

## Verification

`node --test apps/server/test/one-components.catalog.test.mjs`

Follow up with the existing component audit, build, API tests and live
tenant registry smoke tests before merging into `main`.
