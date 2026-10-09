# Salesforce Report Builder parity scope — historical notes

**Status:** Superseded; completeness addendum added 2026-10-09. The authoritative scope is [PARITY_SCOPE_FREEZE.md](PARITY_SCOPE_FREEZE.md). This file is retained as implementation-history context only; its narrower boundary, exclusions, and completion claims are not authoritative.
**Historical baseline:** Trailhead reporting content available on 2026-10-07.

Trailhead is the scope authority: [Reports & Dashboards for Lightning Experience](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards). The module's report-specific units are [Create Reports with the Report Builder](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards/lex_implementation_reports_dashboards_using_report_builder), [Filter Your Report](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards/lex_implementation_reports_dashboards_filter_your_report), and [Format Your Report](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards/lex_implementation_reports_dashboards_report_formats). This note freezes those units into three independently verifiable phases; it does not treat undocumented Salesforce behavior as a requirement.

The user explicitly requested a completeness review on 2026-10-09. The review found that phase summaries and generic report tests can miss individual report types, fields/relationship paths, demonstrated examples, or differences between builder preview and saved/run output. The master checklist now adds **REPORT-10 through REPORT-12** for reference inventory, authoring-to-result consistency, and demonstrated workflows/boundary cases (including the unresolved Opportunity Fiscal Period question). Agents must use REPORT-01 through REPORT-12 in the master checklist; this historical phase breakdown is supporting context, not exhaustive acceptance criteria. The additions do not claim implementation or verification.

## Phase 1 — Create reports with the Report Builder

Create a report from an enabled report type/object, search report types by category/object/field, start the report, choose fields, configure its name and description, and save and run it. The builder exposes distinct Outline and Filters tabs, a searchable Fields panel with drag-and-drop to the outline, filters, or preview, a manually refreshable data preview with optional automatic previews after edits, and a separate report run page. This phase includes the existing tabular, summary, and matrix format choices at their basic authoring level.

**Acceptance:** create, edit, save, select, run, and delete reports; configured fields and metadata persist; report execution honors record and field access.

## Phase 2 — Filter your report

Implement each filter type named in Trailhead: standard filters (Show Me, status, and date field/date range), field filters (including multi-value picklists and the documented operator families), custom Boolean filter logic with AND/OR/NOT and parentheses, cross filters (with/without a related child object and optional child-field subfilters), and tabular row limits with sort field and direction. Keep standard filters separate from field-filter logic. Preserve filter locks for report-run values and treat blank filters as inactive even inside nested Boolean expressions.

**Acceptance:** each filter configuration is saved, editable, and applied server-side; field logic is validated without `eval`; cross filters only use actual object relationships; row limits apply after sorting and only to ungrouped tabular results; filter restrictions never broaden the user's access.

## Phase 3 — Format your report

Complete Trailhead's tabular, summary, and matrix behavior: row/column grouping, numeric summaries, subtotals, report charts where supported, show/hide detail rows, and the Public Reports folder destination used in the unit examples. Bucket fields and formulas are explicitly marked as not covered by this module and are not included in this frozen scope. Dashboard construction and dashboard-only chart behavior remain excluded.

**Acceptance:** each format produces the corresponding report output and summary behavior, persists its configuration, and remains consistent with the user's access.

## Phase status

**Historical status only; not a parity verdict for the consolidated frozen scope.** The statements below refer only to the earlier report-specific checklist and do not establish completion of the current scope.

- Phase 1: complete. The report-type chooser supports category/object/field search, the Fields panel supports search and drag-and-drop to Outline, Filters, and Preview, and the builder supports manual and optional automatic unsaved previews. Create/edit/save/select/run/delete, report metadata persistence, run-page behavior, and record/field access enforcement were checked against the unit and regression coverage.
- Phase 2: complete. Standard filters retain the selected date field for the documented Created Date + All Time setting; Case presents the standard date choice as Opened Date while its report column is Date/Time Opened. Field filters, multi-value selections, operator validation, Boolean logic, blank filters, filter locks/run overrides, related-child cross-filters, and sorted tabular row limits were audited and are covered by server tests.
- Phase 3: in progress. Tabular, summary, and matrix output; grouping/date grouping; numeric summaries and grand totals; charts; hidden details; and Public Reports are implemented and covered by server regression tests. The Trailhead Case summary and Opportunity tabular examples' fields are available by default, including computed report-only values and protected fields. Phase 1 of the remaining implementation roadmap below adds the missing multi-level subtotals; matrix-specific and boundary-case verification remains.

## Remaining implementation roadmap

1. **Phase 1 — Multi-level subtotals (complete):** return subtotal aggregates for each parent row-group level and render them for Summary and Matrix reports. Verify row counts and configured numeric summary operations with a focused integration test.
2. **Phase 2 — Subtotal behavior verification (complete):** tested two- and three-level grouping, matrix column splits, date-group values, null groups, numeric subtotal values, hidden detail rows, chart-enabled reports, and record-access filtering.
3. **Phase 3 — Final parity verification (incomplete):** the final audit against the authoritative [PARITY_SCOPE_FREEZE.md](PARITY_SCOPE_FREEZE.md) was not completed. In particular, the Report Builder acceptance IDs in that document have not been individually verified against their criteria and evidence.

The subtotal implementation and its listed regression cases are complete. That implementation evidence does not establish 100% Report Builder parity: the consolidated frozen checklist remains authoritative, and the final item-by-item audit, including the Opportunity Fiscal Period question, is still pending.

Earlier implementation validation recorded passing server/web builds and server tests (13/13). These results validate the tested changes but do not close the remaining parity audit.
