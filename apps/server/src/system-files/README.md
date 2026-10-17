# Fresh System Runtime Services

These independent modules are an initial SQL-backed foundation. They do **not** import legacy JSON, platform-state, or deleted seeders.

Use `schema.sql` only on an approved empty/fresh database after review; it creates separate `md_*` tables and does not migrate or read existing tenant data. Never auto-run this SQL in production.

Files are intentionally **not wired into the existing server**. The current server still imports deleted modules and must be independently refactored before startup can work.

Security and functional gaps before production: tenant-scoped foreign-key enforcement, record-level/field-level permissions, SQL type validation and reference integrity, credential and user enrolment, flow executor, client renderer registry, token lifecycle, tests and complete RBAC denial semantics.

No bootstrap seed data is generated, no existing object metadata is read, and no production database has been changed.
