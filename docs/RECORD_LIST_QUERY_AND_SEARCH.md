# Record lists, saved views, and search

Record lists use the tenant-scoped Records API and the shared `RecordEngine`. Object, field, and record access checks remain server-side for list results, filters, sorts, search, saved-view scopes, and lookup type-ahead.

## Querying records

`GET /api/records/:objectApi` supports bounded page sizes, typed field sorting, text search, and both the legacy single-field filter parameters and composable filters:

```text
filters=[{"field":"Amount","operator":"gte","value":"100"},{"field":"Name","operator":"startsWith","value":"A"}]
filterLogic=1 AND 2
sortField=Amount
sortDirection=desc
limit=50
```

Supported operators are `eq`, `ne`, `lt`, `lte`, `gt`, `gte`, `contains`, `startsWith`, `includes`, `excludes`, and `in`. `includes` and `excludes` apply to multi-select picklists; `in` accepts an array of values. Filter logic accepts numbered conditions, `AND`, `OR`, and parentheses, for example `1 AND (2 OR 3)`. With no explicit logic, filters are combined with `AND`.

The response retains the exact `total` count. It also includes an opaque `nextCursor` when a keyset page can be continued. Pass that cursor with the same filter and sort parameters to request the next page; do not combine a cursor with a different sort or query. Offset pagination remains supported for compatibility and exports.

## Saved list views

Saved views are stored relationally in SQL. They contain an owner, visibility (`private`, `all`, or selected `groups`), record scope (`my`, `all`, `my_team`, or `queue`), display columns, filters and logic, sort configuration, and per-user pin state. The list-view controls let users select columns, add up to 20 typed filters, define numbered `AND`/`OR` logic, and update or save views. `in` values are entered as comma-separated values; multi-select `includes` and `excludes` values are semicolon-separated. Shared views require the object's `manage` permission; group access is evaluated through tenant-scoped public-group membership.

The Records API exposes list, create, load, update, delete, pin, and group-selection routes under `/api/records/:objectApi/list-views`. To apply a view to a records request, include its `viewId`. The server rechecks the current user's field and record permissions when applying it.

## Search and lookup type-ahead

Object Manager's Search Layouts editor configures visible result/lookup columns and searchable text fields. Search fields have weights `A` through `D`; PostgreSQL stores per-record/per-field `tsvector` indexes and ranks matches using those weights. Field-level read grants are applied to the set of searchable fields for each requesting user.

The global search control searches object list APIs with the `search` parameter. Lookup dialogs request matching records from the server as the user types rather than searching only the initially loaded page. Search results are bounded and use the same record authorization as ordinary list requests.

## Scale and counts

Typed value projections and supporting indexes are used for numeric, date, datetime, boolean, text, and default list-page access. A list request materializes the authorized record IDs once, derives its exact total from that same set, and pages the results from it; this avoids a separate count query repeating the central record-access evaluation. The central evaluator and exact totals are retained. No approximate totals or separate authorization bypass/projection is used. Exact totals still require evaluating access for each candidate record, so very large objects may need further optimization backed by live-database plans and benchmarks.
