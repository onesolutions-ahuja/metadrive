# Shared Field Engine boundaries

All field metadata remains tenant-scoped in SQL. This module registry is code-level
capability metadata, not a database replacement and not an additional CRUD engine.

- `FieldRegistry.ts`: type descriptors for the 23 requested field categories.
- `FieldDispatcher.ts`: resolves a SQL field's kind and relationship subtype.
- `FieldValidator.ts`: metadata type checks and migration compatibility; the
  existing `RecordEngine` remains authoritative for write-time validation and RBAC.
- `FieldFormatter.ts`: existing auto-number, rich-text and encrypted-mask utilities.
- `FieldTypeMigration.ts`: relocated tenant-aware SQL migration implementation,
  with existing `system-files/field-type-migration.ts` import compatibility.
- `types/*.ts`: individually registered metadata descriptors.

`LookupField` and `MasterDetailField` share the existing SQL `reference`
storage kind. They are distinguished by relationship metadata. `FileField` and
`ImageField` use existing File/Media services and intentionally have no invented
SQL scalar data types. Other SQL-only structured `address` and `geolocation`
fields remain supported by the Record Engine even though they were not included
in the requested 23-file blueprint.

The existing generic Object/Record API, OneEngine RBAC, tenant isolation and
SQL migration safeguards remain the source of truth. Do not introduce alternate
field validation in application-specific runtimes or change published data types.
