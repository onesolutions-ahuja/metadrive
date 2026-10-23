# MetaDrive approved SQL Core

This directory contains **exactly thirty-five approved Core modules**. The architecture
contract and responsibilities are documented in `docs/server-code-organisation.md`.

The active HTTP server and entrypoint live under `../system-support/`. This is
an infrastructure boundary, not an alternative metadata, CRUD, RBAC or Flow engine.
Versioned additive SQL migrations also live under `../system-support/migrations/`;
the local `schema.sql` is for fresh installations, **not** an automatic
production replacement or migration of existing tenant data.

Field definitions persist precision/scale, relationships, defaults, uniqueness,
external IDs, descriptions, help text, formula metadata, picklist variants,
compound address and geolocation values, time values, sanitized rich text and auto-number formats in
tenant-scoped SQL. Multi-select picklist choices also use normalized relational
child rows and `INCLUDES`/`EXCLUDES` list filtering. Deleted fields retain their
data for a 15-day recovery period before purge. Formula fields calculate on read
with a shared parser, field-reference type checking, same-object and lookup
references, arithmetic, text, logical, date/time, numeric and geolocation
(`DISTANCE`) functions. Record-triggered Flow formulas also support
`ISCHANGED`, `ISNEW` and `PRIORVALUE` against `$Record` fields. The bounded
formula runtime includes lazy `IFERROR` fallback, `T`/`ISOWEEK`/`ISOYEAR`,
user-time-zone-aware `TZOFFSET`, and
Salesforce-style rounding; neither formula runtime claims full Salesforce
formula compatibility. Regex formulas are intentionally unsupported, and
`GETSESSIONID` is unavailable because formula evaluation must not expose
authentication session credentials.
Encrypted text uses the existing opaque platform vault,
is context-bound to its tenant/object/field, masked by default, and audited when
revealed under the `ViewEncryptedData` permission. The shared Records API
applies readable-field sorting, search and exact field filters before pagination.
Roll-Up Summary fields support COUNT and SUM over numeric child fields and MIN
and MAX over numeric, Date or Date/Time child fields through active
Master-Detail relationships. Aggregates are stored in their matching typed
projections and recalculate transactionally on child creation, update,
reparenting and deletion. Roll-Up Summary filter
criteria support All/Any logic, typed comparisons, null checks and text contains.
Tenant-scoped, transactional field migrations cover text, numeric, checkbox
and temporal conversions; picklist and multi-select transitions; sanitized
Rich Text Area; Address and Geolocation projections; and Lookup/Master-Detail
target changes when existing record links validate against the new target.
Formula results are materialized through the shared formula runtime; encrypted
field transitions decrypt and re-encrypt through the opaque vault; Roll-Up
Summary targets are recalculated through the shared record engine; and Auto
Number targets allocate a per-object sequence using the configured display
format. Conversion is strict rather than lossy: invalid values, target
constraint violations, precision/scale/length overflows and relationship
integrity failures reject the whole change. Before/after typed values and
relationship, picklist, global-value-set, formula, roll-up and Auto Number
counter metadata are snapshotted. Plaintext snapshots for encrypted targets
are themselves vault-encrypted. Rollback is allowed only in reverse order and
while migrated data, records, sequence counters and metadata remain unchanged.

Object Manager settings, Field Sets and supported object actions persist in
tenant-scoped SQL. Quick Actions resolve enabled custom `Set Field Value`
metadata through the shared Record Engine; unsupported standard/custom action
behaviors cannot be invoked from Flow. Global
Value Sets are shared across picklist fields. Custom Labels, Custom Metadata
types/records and hierarchical Custom Settings use typed relational values and
tenant-scoped RBAC-protected APIs. External Objects, External/Indirect Lookups
and Big Objects remain intentionally out of scope.

Rich Text Area values are sanitized on write and during type migration. Inline
images use tenant-scoped SQL file rows associated with one Rich Text field and
record; uploads are limited to 1 MiB JPEG, PNG, GIF or WebP images, 8,192 pixels
per dimension, 40 megapixels per image, 20 images per field, and 100 MiB per
tenant. Upload,
read and delete require the central `Files` permission plus the associated
record, object and field permissions. The browser fetches protected image
content with its authenticated API session and renders only allowlisted HTML;
image insertion is available when editing an existing record. Stored content
is checksum-verified before serving.

Other directories:
- `../app-seeders/`: independently versioned app metadata seeds
- `../../test/system/`: system regression tests
- `../../scripts/`: build and SQL smoke utilities

The shared Core provides SQL persistence, Object metadata, authentication, RBAC,
record CRUD, components, pages, flows, app lifecycle, tenant provisioning,
session metadata, platform tenant administration and generic system definitions.

Do not introduce parallel engines or hardcoded app logic. Before extending Core,
inspect and reuse the existing service. Keep tenant checks and server-side RBAC.
Run `npm run check` and the PostgreSQL SQL-smoke validation before merging.

The SQL Flow runtime supports Screen and Autolaunched flows, plus durable Wait
paths in after-save Record-Triggered Flows, with record queries
and mutations, collection operations, bounded formulas, Subflows, fault paths,
durable Wait elements, and durable asynchronous HTTPS callouts. Waits persist
the interview cursor and variables with the resume job in one SQL transaction;
they retain the initiating user context and recheck activation and execution
permission before resuming. Roll Back Records uses a transaction savepoint to
undo earlier SQL mutations in the Flow while retaining Flow variable values;
it cannot reverse external side effects. Record-triggered flows support
before-save Assignment/Decision paths and after-save paths in the same
RecordEngine transaction. Before-save assignments can set scalar `$Record`
fields. Record Collection assignments support bounded matching-Object records,
including loop values; scalar assignment operators are type-checked. Custom Error can reject a record save with a page- or field-level
message. After-save Record-Triggered Flows may pause at durable Wait elements;
their resume job is committed with the interview state and initiating record
transaction. CRUD performed inside a Flow does not recursively dispatch record
triggers. Active Record-Triggered and Schedule-Triggered versions have
tenant-scoped SQL subscriptions; save, activation, deactivation and archival
update those subscriptions transactionally. Activating a version deactivates
the prior active version atomically. Version History can restore an older
graph as an inactive draft for review and activation; it does not overwrite
history or change production execution by itself. The worker scans scheduled
subscriptions using the configured tenant service identity, enqueues
idempotent occurrence jobs and rechecks Flow activation, app entitlement and
OneEngine execute permission before each interview. Schedule times resolve in
their configured IANA zone, including daylight-saving validation. Scheduled
and Platform Event Flows use durable per-interview execution; Platform Events
are published to a typed SQL outbox and delivered to versioned active
subscriptions with fail-closed app, tenant and RBAC checks. Publishing is
available through the authenticated `/api/platform-events/:apiName/publish`
endpoint and the Flow Publish Platform Event element. Each scheduled scan is
capped at 500 Flows and each Flow run at 500 records. A
single record operation is capped at 50 matching Flow executions, and each
interview is bounded to 200 element steps. Durable callout payloads
and captured variable values are encrypted in SQL; the worker retries
configured attempts and retains terminal failures.
Platform Event descriptions, fields and picklist values are tenant-scoped
relational metadata; the migration backfills legacy JSONB definitions before
removing their embedded field properties.
Decision outcomes also support custom condition logic, null checks, Contains,
Starts With, and record-trigger-only Is Changed/Was Set operators. Is Changed
compares `$Record` with `$Record__Prior`; Was Set detects a blank-to-populated
field transition. Unsupported operators and invalid trigger-field references
fail activation.

Create Task, Quick Actions, Post to Chatter, Submit for Approval and Custom Notification are
the currently supported core Actions. Quick Actions resolve enabled tenant Object
Action metadata and currently execute the `Set Field Value` behavior through the
shared Record Engine; object, record, and field edit permissions are enforced
for the running user. Standard actions and other custom action behaviors are not
invokable from Flow yet. Create Task and Post to Chatter write to
the existing record activity/feed tables in the Flow transaction and require
central Object and Record edit rights for the target record. Submit for Approval
uses active tenant approval-process metadata (or explicit approvers), checks
the submitter's edit and each approver's approval/read rights, and writes
grouped requests to the existing approval table in the same transaction.
Custom Notification checks
`Notification:send`, accepts up to 100 distinct enabled users from the same
tenant, and inserts notification rows inside the Flow SQL transaction. A fault
connector rolls back the action's savepoint before continuing; without one the
Flow fails and the enclosing transaction rolls back. These SQL-backed actions
do not have independent retries; the durable worker avoids replay after an
ambiguous lease recovery. Legacy Send Email, Email Alert, password recovery,
dashboard mail and email Quick Actions are disabled: the SMTP sender and
delivery dependencies have been removed. Existing SMTP credentials and
outbox rows are retained, but new SMTP credentials cannot be created and
legacy queued email is marked failed rather than sent. Configure future email
delivery as an HTTPS Named Credential plus an HTTP Callout Flow. Outbound
Message remains unavailable.
Record-Triggered Flows also support a Custom Error element with a resolved,
bounded message. It aborts the Flow and enclosing record transaction; a
field-level error is returned as a 400 response with the affected field name.

After-save Record-Triggered Flows support durable Scheduled Paths from the
Start element. Date/DateTime source fields and signed minute/hour/day offsets
are validated against tenant metadata and field-read permission. The paused
interview, `$Record`/`$Record__Prior` snapshot and `flow.resume` job commit
with the triggering record transaction. Later matching record-trigger events
replace pending paths for that record; blank date values do not create a path.
Date values resolve at midnight
UTC, while DateTime offsets preserve their timezone-aware instant. Resume jobs
recheck the active Flow version, initiating user, app entitlement and Flow
execute permission. Each Flow supports at most 20 paths and a record operation
at most 100 scheduled interviews.

**Known functional limits:** Standard Quick Actions and other custom Quick Action
behaviors; complete Salesforce formula semantics; recursive record-trigger
execution; and the remaining advanced Flow surfaces are not yet implemented.
The Core also does not yet provide all advanced builders,
tenant-admin routes, record-sharing policies, or complete metadata
publishing/version rollback. Passing CI does not demonstrate full Salesforce
parity or end-to-end production readiness.
