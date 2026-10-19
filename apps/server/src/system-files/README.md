# MetaDrive approved SQL Core

This directory contains **exactly twenty-four approved Core modules**. The architecture
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
with a safe parser, same-object and lookup references, and the current shared
arithmetic, text, numeric and geolocation (`DISTANCE`) function set. The shared Records API
applies readable-field sorting, search and exact field filters before pagination.
Roll-Up Summary fields support COUNT, SUM, MIN and MAX over numeric child fields
through active Master-Detail relationships, and recalculate transactionally on
child creation, update, reparenting and deletion. Roll-Up Summary filter
criteria are not yet supported.

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

The SQL Flow runtime supports Screen and Autolaunched flows with record queries
and mutations, collection operations, bounded formulas, Subflows, fault paths,
and durable asynchronous HTTPS callouts. Record-triggered flows support
before-save Assignment/Decision paths and after-save paths in the same
RecordEngine transaction. Before-save assignments can set scalar `$Record`
fields; CRUD performed inside a Flow does not yet recursively dispatch record
triggers. Durable callout payloads and captured variable values are encrypted
in SQL; the worker retries configured attempts and retains terminal failures.

**Known functional limits:** durable scheduled and platform-event execution;
waits, rollback, several core actions, complete Salesforce formula
semantics, recursive record-trigger execution, and all remaining advanced Flow
surfaces are not yet implemented. The Core also does not yet provide all advanced builders,
tenant-admin routes, record-sharing policies, or complete metadata
publishing/version rollback. Passing CI does not demonstrate full Salesforce
parity or end-to-end production readiness.
