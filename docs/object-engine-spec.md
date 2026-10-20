# Object Engine specification

One tenant-scoped Object/Record engine performs CRUD, filtering, relationships, query, validation, pagination, typed values and audit-compatible transactions. All applications call the same shared APIs. Object, Field and Record access is enforced server-side through central RBAC; app installation and entitlement are independent checks.

Object metadata and record data are SQL-backed. Create/update/delete must preserve tenant constraints, referential integrity, soft deletion/recovery and published metadata compatibility. Never duplicate CRUD to support an optional app or Builder.

Existing contracts: [PHASE1_RECORD_LIFECYCLE.md](PHASE1_RECORD_LIFECYCLE.md), [RECORD_LIST_QUERY_AND_SEARCH.md](RECORD_LIST_QUERY_AND_SEARCH.md), [UNIVERSAL_REFERENCE_PICKER.md](UNIVERSAL_REFERENCE_PICKER.md), [SQL_RUNTIME_COMPATIBILITY_AUDIT.md](SQL_RUNTIME_COMPATIBILITY_AUDIT.md).
