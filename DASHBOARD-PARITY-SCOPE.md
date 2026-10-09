# Dashboard Builder parity scope — historical notes

**Status:** Superseded; completeness addendum added 2026-10-09. The authoritative scope is [PARITY_SCOPE_FREEZE.md](PARITY_SCOPE_FREEZE.md). This file is retained as implementation-history context only; its checklist is not a separate acceptance scope.  
**Baseline:** Salesforce Trailhead, [Visualizing Data with Reports and Dashboards](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards/lex_implementation_reports_dashboards_visualizing_data), frozen to the October 7, 2026 cutoff.  
**Scope rule:** Use the consolidated frozen scope. Do not use this historical note to narrow or override it.

The user explicitly requested a completeness review on 2026-10-09. The review found that a widget list and a few end-to-end examples do not by themselves prove every documented property, filter interaction, identity/refresh workflow, or downstream effect. The master checklist now adds **DASH-11 through DASH-13** for reference inventory, widget/filter end-to-end behavior, and report dependency/access changes. Agents must use DASH-01 through DASH-13 in the master checklist. These additions prevent treating this historical checklist as exhaustive and do not claim implementation or verification.

## Acceptance checklist

### Dashboard creation and editing

- [ ] **DB-01 — Create and name a dashboard:** A user can start a dashboard, give it a name and optional description, and create it.
- [ ] **DB-02 — Add dashboard filters:** A user can add a filter by choosing a field and criteria; saved filter choices affect applicable dashboard data.
- [ ] **DB-03 — Add supported widget types:** A user can add report-backed chart/table widgets, metrics, gauges, rich-text widgets, and image widgets.
- [ ] **DB-04 — Configure widgets:** A data widget can select or change its source report and display type; its title identifies its source, and its subtitle and footer can be set optionally.
- [ ] **DB-05 — Arrange and size widgets:** A user can move widgets on the dashboard, resize them, and arrange different sizes together on a responsive dashboard layout.
- [ ] **DB-06 — Save and open the result:** Saving persists dashboard definition, filters, widget sources/settings, and layout; the saved dashboard can be opened in its viewer.

### Source reports and dashboard data

- [ ] **DB-07 — Build and run a usable source report:** The report workflow supports selecting report fields, standard Show Me/date filters, grouping rows, saving, and running a report that can supply a dashboard widget. It must support the demonstrated Leads-by-Lead-Source workflow.
- [ ] **DB-08 — Enforce eligible source-report types:** Joined reports and historical trend reports cannot be selected or saved as dashboard widget sources.
- [ ] **DB-09 — Share report and dashboard folders with their intended audience:** Folder access determines who can discover/use the source report and dashboard; report data remains subject to the viewer's record and field permissions.
- [ ] **DB-10 — Render report-backed widgets:** A saved dashboard can display a selected source report as a chart or table, including the demonstrated grouped Leads donut chart, and preserve its source-derived title and optional subtitle/footer.

### Dynamic-dashboard identity and access

- [ ] **DB-11 — Evaluate data as the logged-in viewer:** A dynamic dashboard uses the viewer's current object, field, record, sharing, and role-hierarchy access; the same dashboard can show each permitted viewer only the data they can access.
- [ ] **DB-12 — Configure dashboard running identity:** Dashboard properties support the dashboard viewer identity and a fixed running-user identity.
- [ ] **DB-13 — Allow authorized preview-as selection:** When enabled, viewers can choose whom to view the dashboard as; eligible managers can preview users below them in the role hierarchy, and View All Data can preview any active tenant user. Every data request is authorized server-side against the selected identity.
- [ ] **DB-14 — Preserve viewer authorization and ownership:** Previewing another identity changes data evaluation only; it does not grant that identity's dashboard/folder access to the viewer or transfer snapshot ownership from the capturing viewer.

## Scope boundary

The checklist covers the dashboard and source-report behavior in the cited Trailhead unit, including its demonstrated creation workflow, report-backed widgets, responsive placement, folder audience, and dynamic-dashboard rules. Report charts outside dashboards, CRM Analytics, unrelated Setup/Flow/record-page functions, and Salesforce features not stated or demonstrated by this unit are not added to this frozen baseline. Existing enhancements beyond this baseline may remain, but they do not replace any checklist acceptance check.

## Verification record

Keep this section as evidence tracking only; do not change the checklist above after freeze.

- Scope freeze: October 9, 2026; source cutoff: October 7, 2026.
- Completion: in progress; acceptance checks are not yet all evidenced.
