# Phase 5 — No-Code Builder UI/UX

Status: started; shared visual and touch affordances committed. Interactive builder enhancements and device validation pending.

## Scope
Page Builder, Dashboard Builder, Flow Builder, Report Builder, Object Manager and Field Manager.

## Expected experience
- A coherent workspace: top bar for page title, save/publish state, preview and undo/redo where supported; palette on one side; selected element inspector on the other.
- Clear selected element boundaries, drag insertion targets and helpful no-selection instructions.
- Every drag-to-add task has a click/tap-to-add alternative.
- Tablet inspectors are accessible in portrait and landscape.
- Phone usage supports inspect, preview and simple property updates rather than forcing precision drag.
- Preview controls clearly identify phone/tablet/desktop and do not imply changes are published.
- Save states distinguish unsaved, saving, saved, published and failed.
- Undo/redo has explicit enabled/disabled states; shortcuts are documented where available.
- Property inspectors group common settings and expose relevant field help.
- Object/Field creation forms use plain language, examples and actionable errors.
- Report and Dashboard Builder align, reorder and resize affordances remain predictable with keyboard/touch alternatives.

## UX journeys for acceptance
1. Add and configure a page component without dragging.
2. Select, move, preview and save a component in phone/tablet/desktop previews.
3. Edit a flow step and return to the canvas without losing selection.
4. Build a dashboard with aligned metrics and understandable arrangement controls.
5. Create an object and field using descriptive forms without knowing technical terms.
6. Save a draft, preview and publish with clear visible state.
7. Cancel a pending edit without accidentally losing saved work.

## Current change
Shared styles strengthen palette focus, touch target size, drag-target recognition, help readability and reduced-motion behaviour.

## Remaining
Actual interactive builder improvements, per-builder preview/panel review, validation runs, live testing and merge.
