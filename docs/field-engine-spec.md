# Field Engine specification

The shared `apps/server/src/field-engine/` includes FieldRegistry, FieldDispatcher, FieldValidator, FieldFormatter, FieldTypeMigration and typed field modules. SQL Object/Field metadata defines the tenant's actual fields; the code registry describes reusable capabilities and is not a replacement metadata database.

The generic Record Engine owns transactions, permission checks and SQL persistence. Field modules own reusable validation, formatting or adapters. Relationship variants share reference storage while applying different metadata safeguards. Formula, rollup, file and media functionality reuse existing engines and tenant-aware services; no parallel processing stacks. Type migrations must preserve data and customisations and support validation and rollback where applicable.

See [PHASE1_RECORD_LIFECYCLE.md](PHASE1_RECORD_LIFECYCLE.md) and [METADATA_BINDINGS_CUTOVER.md](METADATA_BINDINGS_CUTOVER.md). The current module documentation is in `apps/server/src/field-engine/README.md`.
