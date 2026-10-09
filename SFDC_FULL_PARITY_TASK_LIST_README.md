# Salesforce parity inventory — coverage definition

**Canonical task file:** [SFDC_FULL_PARITY_TASK_LIST.csv](./SFDC_FULL_PARITY_TASK_LIST.csv)

This inventory defines the Salesforce feature baseline for parity in these MetaDrive areas:

1. Report Builder
2. Dashboard Builder
3. Lightning App Builder / Page Builder
4. App Manager and metadata-driven configuration
5. Object Manager

It includes features whether MetaDrive has them already or not. The CSV records one capability or workflow per row, a concrete Salesforce/Trailhead example, the source lesson, and MetaDrive status/evidence. `Yes` means the behavior is present; `No` means it is absent; `Partial` means only part of the behavior is present or parity is not established.

**Agreed completion commitment (October 9, 2026):** The user confirmed this inventory as the parity target for the five modules above. Implementing and verifying every applicable row means Salesforce parity against this inventory for those modules. Do not later narrow, replace, or reject this target. Continue through all rows; if a specific row is genuinely blocked by an external dependency, identify that row and the precise input or access needed.

## Source boundary

The catalog is the Salesforce feature surface taught or demonstrated in the following directly relevant Trailhead modules, units, and hands-on projects. Features are not excluded because they were outside an earlier implementation tracker or parity freeze.

- **Reports and dashboards:** [Reports & Dashboards for Lightning Experience](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards), its units on [Report Builder](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards/lex_implementation_reports_dashboards_using_report_builder), [filters](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards/lex_implementation_reports_dashboards_filter_your_report), [formats](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards/lex_implementation_reports_dashboards_report_formats), and [visualizing data](https://trailhead.salesforce.com/content/learn/modules/lex_implementation_reports_dashboards/lex_implementation_reports_dashboards_visualizing_data); [Create Reports and Dashboards for Sales and Marketing Managers](https://trailhead.salesforce.com/content/learn/projects/create-reports-and-dashboards-for-sales-and-marketing-managers); and the directly relevant [row-level formulas lesson](https://trailhead.salesforce.com/content/learn/projects/rd-summary-formulas/rd-row-level-formulas).
- **Lightning App Builder and pages:** [Lightning App Builder](https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder), including its [builder overview](https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/lightning_app_builder_intro), [Home pages](https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/lightning_app_builder_homepage), [Record pages](https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/lightning_app_builder_recordpage), [App pages](https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/lightning_app_builder_apphome), [Dynamic Forms](https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/get-started-with-dynamic-forms-lab), and [visibility rules](https://trailhead.salesforce.com/content/learn/modules/lightning_app_builder/add-visibility-rules-for-dynamic-pages-lab); plus the hands-on [dashboard and report embedding project](https://trailhead.salesforce.com/content/learn/projects/rd-embed-reports-dashboards/rd-create-report-and-dashboard).
- **Object Manager and metadata-driven configuration:** [Setup and the Object Manager](https://trailhead.salesforce.com/content/learn/modules/setup-quick-look/learn-to-use-setup-and-the-object-manager), [Custom Objects and Fields](https://trailhead.salesforce.com/content/learn/modules/lex_customization/lex_customization_custom_objects), [Data Modeling](https://trailhead.salesforce.com/content/learn/modules/data_modeling), [Object Relationships](https://trailhead.salesforce.com/content/learn/modules/data_modeling/object_relationships), [Schema Builder](https://trailhead.salesforce.com/content/learn/modules/data_modeling/schema_builder), [Formula Fields](https://trailhead.salesforce.com/content/learn/modules/point_click_business_logic/formula_fields), [Roll-Up Summary Fields](https://trailhead.salesforce.com/content/learn/modules/point_click_business_logic/roll_up_summary_fields), [Validation Rules](https://trailhead.salesforce.com/content/learn/modules/point_click_business_logic/validation_rules), [Page Layouts and Record Pages](https://trailhead.salesforce.com/content/learn/modules/lex_customization/lex_customization_page_layouts), [Compact Layouts](https://trailhead.salesforce.com/content/learn/modules/lex_customization/lex_customization_compact_layouts), and the relevant [record type](https://trailhead.salesforce.com/content/learn/projects/customize-a-salesforce-object/create-record-types) and [lookup filter](https://trailhead.salesforce.com/content/learn/projects/customize-a-salesforce-object/create-lookup-filters) projects.

This is a complete inventory for that defined module feature surface. It is not a claim of parity with every Salesforce product, every Setup page, every edition-specific capability, or Salesforce features unrelated to these named modules. If the accepted module source material changes, update the inventory by adding the newly taught capability and its source as a new row; do not remove existing rows merely because MetaDrive lacks the feature.

## Inventory totals

The CSV contains 151 feature/workflow rows:

| Module | Rows |
|---|---:|
| Object Manager | 48 |
| Report Builder | 35 |
| Dashboard Builder | 25 |
| Lightning App Builder / Page Builder | 30 |
| App Manager and metadata-driven configuration | 13 |
