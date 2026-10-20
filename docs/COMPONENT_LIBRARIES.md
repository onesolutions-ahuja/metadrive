# Web source organization: Core and One

```
apps/web/src/
  main.tsx
  core/
    authentication/  # login, session and authentication views
    workspace/       # shell, routing, navigation and shared theme
    metadata/        # definitions, references and caches
    security/        # permissions and sharing administration
    platform/        # tenant administration and protected surfaces
    applications/    # generic App Manager, AppExchange and setup guidance
    integrations/    # generic connector and credential administration
    automation/      # shared Flow screen runtime and administration
    components/      # one registry, renderer, sandbox and library management
    pages/           # shared page/dashboard rendering and routing
    records/         # generic record workspace and forms
    builders/        # lazy Page, Dashboard, Report, Flow and Object editors
    settings/        # shared platform settings
    accessibility/   # dismissal and modal hooks
    public/          # marketing page
  one/
    OneCalendar/
      OneCalendar.jsx
      OneCalendar.css
      component.json
    OneCard/ ...     # all 41 registrations follow the same pattern
    OneSmartFieldInput/ ... # reusable controls shared by multiple screens
    shared/          # common hooks, presentation helpers, types and CSS
    manifest.json    # common properties and descriptor index
```

## Classification and usage evidence

System authentication, permissions, metadata, administration, generic CRUD,
registries and runtimes belong to Core. Builders remain behind dynamic imports.
One contains reusable registered components and controls shared by multiple
runtime/builder screens. SmartFieldInput is shared by Flow, Dashboard and
component editing; record search/picking is shared by the shell and record views.
The common dismissal hook stays in Core because authentication also uses it.

There are no separate optional frontend application packages under this `src`.
App schemas and actions remain selected through metadata and server seeders.
No optional app dependency or second renderer is introduced into Core.

`web-source-moves.json` records original locations, destinations, reasons and
original module consumers. CSS imports, build/test entrypoints and descriptor
references were checked separately: no TypeScript importer does not by itself
mean a source file is unused. `one-component-extractions.json` records the move
from grouped renderers to individual components.

## Ownership, references and duplicates

Components keep their source, existing dedicated CSS and helpers together.
Shared workspace styles stay in WorkspaceTheme because they span screens;
their cascade order is preserved. One components own CSS entries that import
shared base styles instead of duplicating them.

The former grouped One modules now contain only shared helpers/hooks. Actual
render branches live in component folders. The repeated appearance helpers now
use one shared implementation with regression coverage for their original
defaults and edge cases. The unused alternate conversation
renderer, catalog re-export, builder contract and shared layout adapter were
removed after checking imports and exported symbol usage. Record search and
object picking were extracted from the system topbar into One.

Imports, dynamic imports, CSS imports, sandbox build entrypoint, test paths,
npm scripts and descriptors point to the new locations. No forwarding files
remain at the old flat paths. API names, versions, bindings, Flow events,
permissions and saved SQL references remain unchanged.

Library discovery deduplicates API identities and prefers published definitions.
The trusted ChatterInbox alias is hidden from new placements when its published
canonical registration covers the same surfaces; saved references still resolve
with their original defaults. Equal labels do not merge distinct registrations.

Kiosk-relevant appearance and selection controls are declared on the reusable
components that consume them: ItemGrid card/image presentation, Choice card
layout and record-backed option images/prices, Overlay selected-image sizing,
and image fitting on Card, Image and Repeater. These remain generic component
properties; they do not add kiosk-specific runtime behavior.

## Packaging and validation

`scripts/component-catalog.mjs` reads descriptors and bundles local One/SystemPanel
dependencies. CSS imports are flattened; JSX uses host-provided React. After
Vite, `apps/web/build-component-library.mjs` emits the static deployment artifact
`dist/component-library/catalog.json`. Startup does not fetch that artifact or
initialize optional components.

Forty-one snapshots were captured from the original grouped renderers before
extraction. Tests compare each extracted component with its original markup and
check JSX dependencies, CSS bundling and the packaging boundary. The relocated
bootstrap test now checks the existing session-restore gate rather than its
obsolete anonymous-first expectation, and runs with the login tests. Existing cart,
metadata, security and server regressions also remain in CI.

Run `npm run check` for source/reference checks, tests, both builds, component
packaging and lazy-bundle verification. Relocated legacy files above the modular
line limit retain their existing exception; their implementation scope does not
grow in this move.

The existing SQL component endpoint still returns abbreviated definitions and
lacks editor save/publish endpoints. This source reorganization does not claim
that separate backend registration contract is complete.
