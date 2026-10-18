# One reusable components

Each registered component owns its implementation, stylesheet entry and
`component.json` descriptor in a folder named after its API name:

```
OneCalendar/
  OneCalendar.jsx
  OneCalendar.css
  component.json
```

`manifest.json` indexes the 41 descriptors and common property definitions.
Descriptor paths are relative to this directory. JSX/CSS paths in descriptors
are relative to `apps/web/src` so the catalog can also reference Core.

`shared/` contains hooks, presentation helpers, record types and base styles.
Component CSS imports the base stylesheet rather than copying it. Components
can import local helpers. `scripts/component-catalog.mjs` bundles those sources
and styles into self-contained code before registration; external packages and
imports outside component source libraries are rejected.

Reusable metadata controls such as OneSmartFieldInput, OneReferenceBrowser and
record search/picking are imported directly by Core screens and builders. Their
existing exports and permissions are unchanged; they are not new registrations.

API names, versions, bindings, Flow events and trust boundaries stay unchanged.
ChatterInbox references OneConversation with its existing inbox defaults.

Run `npm run test:components` for original-renderer snapshots. The build emits
`apps/web/dist/component-library/catalog.json`, a static deployment artifact,
not a tenant metadata store or a trust grant.
