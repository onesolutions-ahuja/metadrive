# MetaDrive Phase 3 — Navigation & Workspace UX

**Status:** Started. Initial navigation presentation changes committed; complete interactive UX and device testing remain pending.

## Navigation rules
- Current app, section and page must be visually identifiable at all times.
- Desktop: clear header, app strip, readable contextual sidebar and breadcrumb path.
- Tablet: collapsible rail or contextual menu without loss of page title or context.
- Phone: accessible navigation labels and short route to frequently used destinations; do not rely on dots or hover.
- Breadcrumb links show human-readable names and wrap instead of clipping.
- Global search clearly distinguishes Objects, Records, Apps, Pages and Settings, with helpful no-results states.
- Profile and workspace menus must remain usable at narrow widths, keyboard zoom and screen readers.
- Show only navigation items the user may access; never imply availability where permissions deny it.
- Do not force the shell over standalone published tenant pages.

## Common workspace header
Hierarchy: app name → current page title → context/actions. One prominent primary action; related secondary actions grouped. Preserve user location across Back navigation and orientation changes.

## Setup discoverability
Present a clearly grouped Setup menu with understandable labels, search and selected states. Avoid label abbreviations that could describe more than one destination.

## Onboarding journeys
1. First-time user opens an app and finds relevant starting action.
2. Admin moves between App Manager, Object Manager and a record without losing context.
3. User finds a record through search and returns to previous results.
4. Mobile user reaches Setup and returns to an app.
5. Keyboard user traverses app strip, menu, breadcrumbs, search and profile.

## UX checks
Review at 320, 390, 768, 1024 and 1440 CSS px; check keyboard only, high zoom, touch, screen reader and reduced motion. Confirm focus visibility, wrapping, no clipped popup, no accidental nested scrolling, and correct selected page.

## Implemented in this initial PR
Presentation-only enhancements for app strip scroll and focus, navigation item size and selection, breadcrumb wrapping/focus, global search result targets, mobile palette fit and profile menu clipping.

**Remaining:** interactive navigation audit and improvements, actual browser/device screenshot comparison, permission-based journeys, full test validation and merge.
