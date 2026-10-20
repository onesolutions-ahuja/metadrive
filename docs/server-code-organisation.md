# MetaDrive SQL runtime architecture

The approved Core is exactly the following forty-six modules in `apps/server/src/system-files/`:
`sql-persistence.ts`, `object-definition.ts`, `authentication.ts`,
`rbac-engine.ts`, `record-engine.ts`, `component-runtime.ts`,
`page-runtime.ts`, `flow-runtime.ts`, `app-runtime.ts`,
`tenant-provisioning.ts`, `schema.sql`, `README.md`,
`session-metadata.ts`, `platform-tenant-service.ts`,
`system-definition-service.ts`, `custom-metadata-service.ts`,
`object-manager-metadata.ts`, `flow-data-actions.ts`,
`flow-decision-runtime.ts`, `flow-formula-runtime.ts`, `flow-record-query.ts`,
`flow-record-triggers.ts`, `flow-subflow-runtime.ts`, `flow-validation.ts`,
`flow-capability-catalog.ts`, `flow-debug-runtime.ts`, `flow-run-history.ts`,
`flow-orchestration-runtime.ts`,
`flow-interview-persistence.ts`, `flow-wait-runtime.ts`,
`flow-action-runtime.ts`, `flow-subscription-runtime.ts`,
`flow-scalar-runtime.ts`, `flow-error-runtime.ts`, `flow-execution-context.ts`,
`auto-number-format.ts`, `record-file-service.ts`, `rich-text.ts`,
`flow-assignment-runtime.ts`, `flow-screen-choice-runtime.ts`,
`flow-execution-requests.ts`, `tenant-media-service.ts`,
`flow-http-mapping.ts`, `flow-integration-connection.ts`,
`platform-event-runtime.ts`,
`field-type-migration.ts`, `encrypted-field.ts`, and
`object-metadata-history.ts`.

Auxiliary HTTP entrypoints, encrypted credential handling, authentication bootstrap
and SQL upgrade migrations live in `apps/server/src/system-support/`.
Independent app seeders live in `apps/server/src/app-seeders/`. Tests live under
`apps/server/test/system/` and build/smoke utilities under `apps/server/scripts/`.

The running server entrypoint is `apps/server/src/system-support/entrypoint.ts`.
The fresh-install SQL schema is not a production data migration. Additive upgrades
are applied by the versioned migration runner; tenant and business records must be
preserved. The Core must be tenant-safe, SQL-backed and enforced through OneEngine RBAC.

`npm run check` verifies imports, builds, tests and file boundaries.
`npm run test:system --workspace apps/server` verifies system unit behaviour.
The SQL smoke job runs against disposable PostgreSQL in CI.

**Important:** Core file-count consistency does not establish functional parity.
Unimplemented endpoints and builder features still require separate verified work.
Do not report full platform completeness based solely on build success.
