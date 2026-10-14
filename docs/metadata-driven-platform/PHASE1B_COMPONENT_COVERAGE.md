# Phase 1b — Component Registry and Reusability Audit

**Scope:** Read-only, checked-in MetaDrive component declarations and consumers. This is a planning and verification subphase, not a runtime migration.

## Verified registry sources

| Definition source | Existing authority | Role | Supported surface(s) |
| --- | --- | --- | --- |
| Standard page catalog | `apps/web/src/componentCatalog.ts` | Code-defined page primitives | Page |
| Standard dashboard catalog | `apps/web/src/componentCatalog.ts` | Code-defined dashboard primitives | Dashboard |
| Bundled custom manifest | `apps/web/src/custom-components/manifest.json` | Bundled component descriptor with default property keys, Flow event keys and source assets | Per manifest |
| Published custom component definitions | `LibraryComponentMetadata` and server `libraryComponentSchema` | Versioned dynamic registered components | Page, Dashboard, Flow |
| PostgreSQL v4 registry shadow | `apps/server/sql/component-registry-v4.sql` | Additive relational schema, **not the active runtime authority** | Page, Dashboard, Flow |

The repository baseline has 9 standard page catalog entries, 3 dashboard entries and 1 checked-in custom manifest descriptor. **These counts are not the number of live installed components**, because dynamically registered tenant components and entitled app-package descriptors require runtime-scoped inspection (Phase 1c).

## Existing component execution routes

| Surface | Existing runtime source | Registered components |
| --- | --- | --- |
| Page | `apps/web/src/App.tsx` | Custom type mapped to `RegisteredComponent`; existing direct page-primitive branches remain |
| Dashboard | `apps/web/src/DashboardBuilder.tsx` | Custom dashboard entries resolved through `findRegisteredComponent` and `RegisteredComponent` |
| Flow screen | `apps/web/src/FlowScreenContent.tsx` | Custom screen fields resolved through the same registry and host |
| Registered component security | `apps/web/src/RegisteredComponent.tsx` and `ComponentSandbox.tsx` | Trusted bundles use the host boundary; untrusted registered components run in sandboxed frames |
| Bundled package installer | `apps/server/src/bundled-app-components.mjs` | Iterates authorised installed package descriptors; only trusted bundle sources can become trusted |

The **same custom component renderer** is already reused across the three supported surfaces. The central platform UI is not yet one of those surfaces. Nothing in Phase 1b changes these execution or trust boundaries.

## Property configuration coverage

- Shared appearance and responsive property descriptors already exist in `metadataAppearanceSchema.ts` and are consumed by visual editors.
- `CustomComponentPropertyEditor.tsx` currently works from instance property values; its type controls are text, number and boolean. Structured values remain preserved, not generically edited.
- The current published registered component schema does **not** expose a typed property-definition metadata contract tying each component's defaults, validation, events and visible inspector controls together.
- Bundled manifests can declare default values and `actionFlows` events, but the backend library definition does not yet store their unified typed property schema.
- The Phase 1b JSON report emits **only property names and types, never configured values, tokens, Flow input values, customer records or source bodies**.
- Current Page Builder palette contains app/vertical-name classifications such as Kiosk and Till. Flag for generic metadata-driven category migration, not silent removal in this audit.

## Migration requirements for Phases 2–5

1. Extend **the existing** `LibraryComponentMetadata` and validation with protected platform surfaces, typed property definitions, events and owner scope. Keep compatibility with existing page/dashboard/Flow metadata.
2. Unify code-defined standard primitives and registered custom components in the same **discovery/property-definition contract**, preserving their existing trusted/untrusted rendering paths. Do not execute tenant code as trusted just to achieve uniform catalog listing.
3. Use the existing appearance/responsive controls as shared property schema inputs; component instance property metadata remains individual and editable.
4. Keep Action/Flow routing and server-side OneEngine RBAC as the authority; component metadata never confers privileges.
5. Replace hardcoded palette category rules with component/category metadata in the intended component-property migration, preserving existing user-facing behaviour until parity tests pass.
6. Keep the SQL-only v4 schema labelled as a shadow until its activation and migration are separately validated. Do **not** add another registry.
7. Reserve live per-tenant registry inventory (without source/record leakage) for Phase 1c.

## Reproducible evidence

Run `npm run test:component-audit` and `npm run audit:components`.
The existing `Developer Policy and Architecture Inventory` GitHub workflow tests the report and uploads `component-registry-inventory.json` alongside the Phase 1a architecture snapshot. The report includes catalog entries, supported surfaces, selected runtime evidence, property schema keys, asset availability, name conflicts and migration findings.

### Phase 1b completion gate

- [x] Existing standard/bundled catalogs and dynamic-registry contract inspected.
- [x] Page, Dashboard and Flow registered runtime paths mapped.
- [x] Shared property/editor capabilities and incompatibilities identified.
- [x] Read-only, safe, repeatable coverage report implemented.
- [x] Automated coverage tests committed and added to the existing policy CI.
- [ ] Check GitHub CI status and inspect generated audit totals before declaring 1b complete.

No app/module is installed in this subphase. The existing registration, seeding and RBAC behaviour is untouched.
