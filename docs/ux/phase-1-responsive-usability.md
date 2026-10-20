# MetaDrive UI/UX Phase 1 — Responsive Usability

Status: **Design specification complete; implementation and device validation pending**.
Scope: visible and interactive experience only. This is not an engineering architecture plan.
Source: supplied UI reviews plus repository inspection on 20 October 2026. Existing mobile card and navigation label overrides were found; neither has been validated in a browser.

## Outcome

At every supported viewport, users can navigate, view and edit what their permissions allow, and save without hidden controls, hover dependence or clipped content. Responsive experience is chosen by available width, not device identity alone.

## Design ranges (viewport guidance, not device detection)

| Range | Width | Experience |
|---|---|---|
| Phone | below 640 CSS px | single-column, bottom navigation for frequent destinations, full navigation drawer |
| Tablet | 640–1023 CSS px | adaptive rail, canvas-first, slide-over inspector, split list/detail where space allows |
| Laptop | 1024–1439 CSS px | full workspace with collapsible panels |
| Desktop | 1440 CSS px and up | expanded workspace and side-by-side tools |

At zoom, increased text size, landscape and split-screen, favour available space. No hard cutoff may make a permitted action inaccessible.

## 1. Phone navigation

- Primary destinations: Home, Records, Apps, More, **subject to actual access and availability**. Do not render empty destinations.
- Each destination has an icon and persistent readable label; selected item has an unambiguous active state.
- More opens a labelled navigation surface with clearly grouped setup and administration destinations. Secondary routes always expose a Back/Close control.
- On screens with too little width for four accessible destinations, reduce primary destinations; do not compress labels into dots.
- Menu closes after navigation, preserves current location and responds to Escape/Back.
- No fixed navigation overlays content or the system home indicator.

**Pass:** at 320, 375, 390 and 430 CSS px, users identify and reach all permitted destinations without guessing.

## 2. Tablet Page Builder and Flow Builder inspectors

- Selecting a component/flow element shows its name and a visible **Edit properties** action.
- Landscape: inspector may be docked or collapsed.
- Portrait: inspector opens as a slide-over or bottom sheet, never simply disappears.
- Inspector contains exactly the same editable properties and validations as desktop.
- **Apply/Save**, **Cancel/Close** stay reachable when keyboard is visible; unsaved-change warnings appear when dismissing.
- Closing returns focus to the selected canvas element. The canvas retains selection and scroll position.
- Palette/toolbox remains accessible from a clear **Add** action, not hover.

**Pass:** tablet portrait and landscape users select, inspect, edit, save and reopen a page component and a flow element.

## 3. Touch and input parity

- Interactive controls target at least 44x44 CSS px with sufficient spacing; icon-only actions have visible context or accessible labels.
- Every hover-revealed essential action is persistently visible on touch or accessible via a clearly labelled More menu.
- Each drag-to-add experience also provides **Tap to add** or **Add to selected region**.
- Drag, resize, reorder and selection provide visible touch feedback, not colour alone.
- Keyboard navigation and screen readers retain full equivalence; visible focus, logical reading order and reduced-motion preference are mandatory.

**Pass:** core navigation and editing journeys can be completed by touch without mouse hover or HTML drag.

## 4. Viewport, safe areas and keyboard

- Header, drawer, bottom navigation, sheets and save bars respect device insets.
- Users can scroll every screen to the last control while mobile browser chrome expands/collapses.
- On-screen keyboard scrolls active form inputs into view and does not conceal Save or validation.
- Landscape phones and split-screen tablets do not trap content in fixed-height boxes.
- No unintended horizontal page overflow.

**Pass:** iOS Safari and Android Chrome, both orientations, keyboard open/closed, plus 200% zoom where practical.

## 5. Dialog and form patterns

- Short confirm: clearly labelled bottom sheet or accessible modal; destructive action visually distinct; Cancel always available.
- Long edit/create form: full-height phone screen with title, labelled fields, scrollable body and persistent Save/Cancel actions.
- Destructive irreversible actions never imply Undo unless recovery genuinely exists.
- Dismissal is predictable: Escape/Back, accessible Close, focus returned to opener, unsaved changes protected.
- Errors appear near corresponding fields and are announced.

**Pass:** edit a record with the keyboard open; cancel without data loss; confirm destructive action intentionally.

## 6. Records on phones

- Default to cards at phone widths, preserving table as optional view for comparison.
- Each card displays metadata-defined record title and up to three meaningful, permitted fields (not arbitrary JSON/API names).
- Show state/badge only when relevant; actions are clear and touch-sized.
- Search, filter, sort, pagination and selection remain reachable, including no-results and loading states.
- Avoid nested scroll areas; never require side-scrolling to read the default card.

**Pass:** users find, sort, open, select and act on records using only the phone screen.

## 7. Tablet runtime and list/detail

- Portrait uses a collapsible rail and readable single-pane or stacked detail.
- Landscape may use list/detail split view where enough space exists.
- Selected row and Back-to-list states remain clear during orientation changes.
- Published tenant pages retain their own configured presentation; platform navigation must not override their branding or intended composition.

**Pass:** users can browse lists and inspect details in both orientations without losing selection.

## 8. Native mobile app — phase-1 critical parity only

- Native login shows recognisable tenant identity; credential fields clearly labelled with obvious error messages; destructive sign-out-and-clear action requires explicit confirmation.
- Records surface shows human-readable titles/labels and formatted values rather than raw field names and JSON.
- Visible navigation includes Home, Records and More where relevant.
- Clear offline indicator and last-synced value appear without requiring users to inspect internal settings.
- iPad navigation and content must not become a single narrow phone column.

**Pass:** an ordinary user can sign in, find a record, read it and understand offline state without technical knowledge.

## Required visual states for every affected screen

Default; selected/active; empty; loading; error; offline (when relevant); no permission; keyboard open; long labels/localisation; narrow width; dark theme if available.

## UX approval journeys

1. Phone user opens MetaDrive, navigates Home → Records → record detail → back.
2. Phone user searches/filters a list, opens a card, edits a record, saves, sees feedback.
3. Admin opens Setup from phone navigation and returns without a lost location.
4. Tablet portrait Page Builder user selects a component, opens properties and saves.
5. Tablet portrait Flow Builder user selects a node, edits settings and returns to canvas.
6. Touch user adds a component without drag-and-drop or hover.
7. Phone user completes a long form with software keyboard open.
8. User cancels a destructive action; data remains unchanged.
9. Tablet landscape user opens a record from split list/detail and returns.
10. Native mobile user signs in, reads a formatted record and checks sync status.

## Verification matrix

Phones: 320, 375, 390, 430 CSS px.
Tablets: 768, 820, 834, 1024 CSS px, portrait and landscape.
Larger: 1280, 1440 CSS px.
Input: mouse, keyboard, touch; platform: iOS Safari, Android Chrome, desktop browsers, native mobile on phone and tablet.
Accessibility: 200% text/zoom checks, focus visibility, VoiceOver/TalkBack spot checks, reduced motion.

## Completion criteria

Phase 1 may be marked **delivered** only when every affected screen has a reviewed target design, actual implemented screens pass all ten UX journeys, no critical failures remain across the verification matrix, and owners sign off on exceptions. Completing this document alone does **not** mean the app UI is fixed.

## Existing UI findings worth preserving

- Repo contains a mobile record card treatment in `apps/web/src/core/workspace/WorkspaceTheme/styles-audit.css`.
- Repo contains a later shortened-navigation-label override in `styles-part2.css`, after older identical-dot styling in `styles.css`.
- These should be checked in the rendered UI before redesign; avoid discarding working experiences without comparative testing.
