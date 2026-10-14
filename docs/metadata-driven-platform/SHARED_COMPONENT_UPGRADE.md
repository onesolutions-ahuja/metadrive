# Shared component upgrade — staged implementation

This branch starts the universal component upgrade requested for all MetaDrive apps, not a kiosk-only copy.

## Completed on this branch
- Additive relational metadata structures for typed component property definitions, selectable choices, per-tenant/app/page/placement property values, field bindings and per-instance Flow action routing.
- Existing component versions and published pages remain unchanged.
- Component definitions can be shared while overrides are isolated by tenant, app, page and placement.
- Tenant ownership enforced for component property overrides.

## Not yet complete; required before activation
- Migrate and reconcile active component definitions and instance settings with the existing legacy authority.
- Introduce a versioned runtime read/write adapter with legacy fallback; wire the Page Builder inspector and renderer to property definitions.
- Upgrade standard components (image, container, card, grid, text, button, tabs, inputs, row, column) where their existing behaviour is insufficient, without changing current defaults.
- Validate Flow binding and server-side RBAC, migration/backfill/rollback, responsive rendering and editing on pre-existing pages.
- Run real Postgres integration tests and browser regression tests; production activation is explicitly gated.

## Non-negotiable compatibility
Keep existing instance IDs and saved layout behaviour. No direct JSON/JSONB storage in this new contract. Roll out behind a disabled-by-default feature flag and do not claim migration or activation until tested.
