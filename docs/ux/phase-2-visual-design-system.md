# MetaDrive Phase 2 — Universal Visual Design System

Status: started; shared semantic visual foundation committed; product-wide adoption and visual QA pending.

## Target visual language
- Clean, approachable enterprise UI with restrained emphasis and clear information hierarchy.
- Primary action: one prominent action per surface, secondary actions visually subordinate.
- Typography: meaningful titles, readable body copy, descriptive labels; avoid microtext on operational screens.
- Consistent spacing, radius, border and shadow scale for all workspaces and components.
- Positive, warning and destructive feedback must communicate meaning with text/icon as well as colour.
- Focus/hover/pressed/disabled states must be obvious and usable without motion.
- Tenant branding can customise accent/font/appearance while semantic danger, readability and contrast remain usable.

## Phase 2 screens to harmonise
1. Workspace header, navigation, breadcrumbs and toolbar.
2. App cards, tiles and onboarding panels.
3. Records table/card surfaces, filters and empty states.
4. Object Manager and builder palettes/inspectors.
5. Forms, modal dialogs, messages and notifications.
6. Dashboard cards, charts and metrics.
7. Mobile/native parallel visual reference, without forcing web-specific layout.

## Shared visual rules
- Controls: consistent heights, readable labels and visible focus treatment.
- Cards: unified border, radius, background and subtle elevation.
- Feedback: semantic success/warning/danger surface and supporting copy.
- Density: comfortable by default; compact mode must remain accessible.
- Themes: verify text/background and interactive contrast in light, dark and branded modes before enabling.
- Do not recolour customer-authored published pages unless the tenant theme explicitly applies.

## Acceptance
- Each targeted screen has before/after visual comparison at desktop and tablet width.
- No conflicting primary brand colour in the same workspace.
- Typography hierarchy and core control states consistent across screens.
- Keyboard focus, contrast, disabled and reduced-motion states reviewed.
- Tenant branding looks coherent and remains legible.
- Core screens and existing published pages retain their intended look.

## Current change
Added semantic token aliases and opt-in shared card, text, primary action and feedback classes in the existing design-system stylesheet. Existing components are not automatically migrated; this avoids unintended regressions. Adoption and browser screenshot verification remain pending.
