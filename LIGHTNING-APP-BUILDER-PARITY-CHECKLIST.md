# Lightning App Builder Parity Checklist

**Status: FROZEN — 2026-10-09; supplemental coverage gates added 2026-10-09**

This is a historical subsystem checklist, superseded as an independent source of truth by [PARITY_SCOPE_FREEZE.md](./PARITY_SCOPE_FREEZE.md). The user explicitly requested an additional completeness review on 2026-10-09. That review found that a fixed feature list could still miss reference-specific properties, transitions, context changes, or consequences. The master checklist now adds **PAGE-10 through PAGE-12** for reference inventory, end-to-end state/round-trip evidence, and context/app integration. Agents must use PAGE-01 through PAGE-12 in the master checklist; the checklist below is supporting history and is not exhaustive by itself. These supplemental gates were added to prevent omissions; they do not claim implementation or verification.

## Scope and reference

Parity means a complete, working UNEEngine implementation of the Lightning App Builder authoring experience described by Salesforce Trailhead, plus the user's explicit requirement for registering reusable custom components from files and exposing those components consistently in builders. It includes the Builder's user experience and the resulting page behavior—not just visual resemblance.

The fixed references are:

- [Trailhead: Meet the Lightning App Builder](https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/lightning_app_builder_intro)
- [Trailhead: Customize a Record Page](https://trailhead.salesforce.com/content/learn/modules/lex_customization/lex_customization_page_layouts)
- The user's explicit requirement: select a component JSX/TSX/JS/TS file and optional CSS in the component library, register it once, then use the registered component in the Lightning App Builder and Dashboard Builder.

The checklist covers the three Lightning page types (App, Home, Record), Builder page authoring and lifecycle, app settings integrated with the Builder, custom-component registration/placement/runtime, and the necessary access, tenant-isolation, persistence, and verification behavior.

It does **not** claim parity for Salesforce as a whole, nor for unrelated Setup, page-layout-editor actions and buttons, Reports, Dashboards as a product, AppExchange package installation, or every Salesforce platform feature. Dashboard Builder is in scope only as a consumer of the shared registered component library. Pixel-identical branding is not required; the complete Builder workflow and responsive interaction behavior are.

## Acceptance checklist

Each item is mandatory. A feature counts as complete only when its stated behavior works end to end and the verification evidence is recorded.

### A. Builder shell, navigation, and app context

- [ ] The Builder identifies the open Lightning page and provides a Pages picker containing the ten most recently modified pages.
- [ ] Selecting an app context identifies that app and limits the Pages picker to active pages associated with the app; an open page remains reachable while editing.
- [ ] App-context App Settings opens from the Builder and permits editing and saving the app's supported branding, navigation, options, and utility items; updates are reflected in the running app.
- [ ] Return to Setup exits without implicitly saving unsaved page changes; Save persists the page and reports failures clearly.
- [ ] Builder help links to the fixed Trailhead Builder reference.
- [ ] The shell and its controls remain usable at supported desktop, tablet, and phone viewport sizes.

### B. Builder toolbar and editing operations

- [ ] Undo and redo restore the exact prior and subsequent page states for supported edits.
- [ ] Cut, copy, and paste work for a selected component, preserve its configuration, and create a distinct component identity when pasted.
- [ ] Save persists page metadata; activation persists assignment/status changes only after validation succeeds and gives a clear outcome.
- [ ] Preview renders the current draft without accidentally saving or activating it.
- [ ] Canvas refresh, device preview, and canvas-fit controls work without mutating saved dimensions or component positions.
- [ ] Disabled, invalid, saving, and failed states are communicated accessibly and cannot report false success.

### C. Page creation, page types, templates, and page properties

- [ ] Users can create, edit, and save App, Home, and Record Pages with a label and unique API identity; Record Pages have a target object.
- [ ] Page properties allow editing the API name as well as the label; invalid or duplicate API names are rejected clearly before persistence.
- [ ] Template-based pages provide the supported one-region, header/main, main/sidebar, and header/main/sidebar region structures.
- [ ] Changing a page template produces the matching canvas regions and preserves or clearly handles existing components.
- [ ] Page properties expose the applicable page identity, type/object, layout mode, template, canvas dimensions, and activation settings.
- [ ] Free Canvas is available for Home Pages, persists dimensions and component coordinates/sizes, and supports non-destructive fit-to-view.
- [ ] Page selection and properties remain usable on narrow viewports; no required controls are hidden behind responsive breakpoints.
- [ ] Saved pages can be reopened after navigation/reload with their metadata and component configuration intact.

### D. Component palette, canvas, and component configuration

- [ ] The palette exposes the UNEEngine standard Lightning page components: Accordion, Activities, Chatter, Highlights Panel, Related List, Tabs, Record Detail, and Report Chart, subject to page-type and object-feature compatibility.
- [ ] On Record Pages, a Fields palette lists fields for the selected target object and supports adding them to Record Detail configuration.
- [ ] Record Page Dynamic Forms support upgrading the existing record-detail layout into individually configurable field/field-section components, arranging fields/sections on the canvas, and saving/rendering the resulting configuration.
- [ ] Palette search filters available standard and registered custom page components.
- [ ] Components can be added by palette interaction, selected on the canvas, reordered by drag/drop, configured in the properties pane, and removed.
- [ ] Template-page components are placed in supported regions; Free Canvas components can be positioned and resized, with saved geometry respected by preview and runtime.
- [ ] Component properties show the selected component's identity/configuration and applicable visibility and data settings; edits update preview and persist on save.
- [ ] Related List choices are derived from relationship metadata for the target object. Saved unavailable relationship names remain visible and can be removed rather than silently discarded.
- [ ] Object feature restrictions prevent incompatible additions and provide an understandable explanation; unsupported saved component types do not silently disappear at runtime.

### E. Page activation and page runtime

- [ ] App Pages can be added to app navigation and open in the selected app at runtime.
- [ ] Home Pages can be assigned at supported app-default and app/profile scopes and render for the matching app, profile, and form factor.
- [ ] Record Pages can be assigned at supported org-default, app-default, app/profile, and app/record-type/profile scopes and render for the matching object, app, record type, profile, and form factor.
- [ ] Activation supports the Builder's Desktop and Phone form factors; preview additionally supports the product's responsive Tablet viewport.
- [ ] Conflicting assignments are rejected with a clear error, and successful assignment/removal is reflected in the resolved runtime page.
- [ ] Runtime renders the configured page regions and supported components with applicable record data and respects effective field/object permissions.
- [ ] Deactivation, missing assignments, unsupported component states, and missing target records fail visibly and safely rather than rendering misleading success.

### F. Shared custom-component registration and builder integration

- [ ] An authorized administrator can register, update, and remove a reusable component by selecting exactly one JSX/TSX/JS/TS source file and optionally one CSS file; metadata includes a label, API name, description, and page/dashboard surfaces.
- [ ] Registration validates inputs and source, reports compilation/validation errors, and never reports success for a failed save.
- [ ] The registered component appears in the global library and in every selected supported builder surface (Lightning App Builder and/or Dashboard Builder) without a duplicate upload.
- [ ] Page-enabled custom components can be added, configured, saved, and rendered in the relevant App, Home, or Record Page runtime; dashboard-enabled components can be added and rendered by the Dashboard Builder.
- [ ] Updating a component updates the shared catalog predictably while existing placements remain associated with the registered component; deleting a component handles existing placements explicitly and safely.
- [ ] The platform-wide registry enforces `metadata:read` for reads and `components:manage` for mutations; component placements remain tenant-scoped and one tenant cannot alter another tenant's page or dashboard placements.

### G. Verification and completion evidence

- [ ] Each checklist item has a recorded verification result, with targeted automated tests for metadata validation, save/activation resolution, permissions/tenant isolation, component registration, and runtime behavior.
- [ ] The primary end-to-end Builder workflows are exercised in a browser: create/edit/save/preview/activate each applicable page type; configure components; register a file-based component and use it on both selected surfaces.
- [ ] Desktop, tablet, phone, and narrow-properties-pane behavior are checked without saving unrelated user data.
- [ ] The web and server production builds pass, relevant test suites pass, and diagnostics report no new errors attributable to the work.
- [ ] Any existing limitations outside the fixed scope are not represented as checklist failures or as general Salesforce parity.

## Freeze and completion rule

The checklist is frozen. Audit against these items, resolve all pending items, and verify them. Do not create another checklist, reopen scope, or request another scope review. When every item is implemented and verified, report **100% done relative to this frozen checklist**. If a genuine blocker prevents a specific item, identify the item and the concrete blocker; otherwise continue implementation.
