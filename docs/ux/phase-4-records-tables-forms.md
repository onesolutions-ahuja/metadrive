# Phase 4 — Records, Tables and Forms UX

Status: **started**. Initial presentation fixes committed; hands-on validation pending.

## Experience targets
- Tables: sticky readable headers, clear sort state, keyboard-visible focus, predictable selection, and restrained row emphasis.
- Toolbar: search and New prominent; secondary commands grouped; bulk actions contextual when selection exists.
- Filters: visible applied-filter chips and clear/reset actions.
- Lists: card view on phones where appropriate, optional tabular comparison, understandable empty/search/error states.
- Forms: readable labels, inline validation, persistent Save/Cancel when necessary and meaningful destructive confirmations.
- Loading: consistent progress and no-results feedback.
- Shared OneTable and record workspace must present the same interaction model and terminology.

## Acceptance journeys
1. Search, sort and page through records on desktop.
2. Filter, open and edit a record on phone.
3. Select multiple rows and find the relevant bulk action.
4. Complete a long form with a keyboard open, then save.
5. Trigger a validation error and recover without losing input.
6. Navigate a table and form with keyboard and screen reader.

## Initial changes
Sticky record-table headers, stronger focus states, clearer mobile card hierarchy, toolbar spacing, overflow-safe messages and improved input presentation. Existing table and card behaviour is preserved.

## Pending
Toolbar/action hierarchy and filter-chip UX; shared OneTable parity; live responsive and accessibility testing; automated validation; merge.
