# Server module boundaries

`apps/server/src/index.ts` is the HTTP/bootstrap entry point. Split independent domain services before extracting route registrars; retain existing API URLs, middleware registration order, tenant-scoped RBAC, commit ordering, and declarative Flow behaviour.

## Initial extraction

- `modules/flows/formula-evaluator.ts` — pure formula parsing, computation and formula validation helpers.
- `modules/flows/condition-logic.ts` — metadata-defined numbered Flow condition parser.
- `core/local-time.ts` — civil-time and daylight-saving conversion used by Flow and dashboard scheduling.
- `test/flow-formula-evaluator.test.ts` — arithmetic, field resolution, condition parsing, regex safety and DST regressions.

## Business apps are not core modules

Kiosk, POS, KDS, and other vertical solutions remain **installable applications**, not platform core modules. Their configurable screens, objects, Flows, RBAC templates and business behaviour belong in tenant-editable app packages. The common backend may expose generic installation, device or authentication primitives. Existing `/api/kiosk/devices` compatibility routes still exist, but should be adapted to app-owned routes rather than creating a core `kiosk` module.

## Next extraction candidates

Object Manager schema/validation, records services, Flow scheduler/execution, metadata API routers, report/dashboard services. Use dependency injection or narrow service interfaces to avoid importing `index.ts` from an extracted module.

## API route extraction continuation (PR #501)

Migration owner: `onesolutions-ahuja` (Core, phase 6 in `MIGRATION_MAP.v1.json`).
The continuation starts from main at `13cf3dba`, including the merged extraction
in PR #496. All 88 remaining direct HTTP endpoint registrations now live in 27
domain registrars under `modules/`. Bootstrap middleware and registrar calls stay
in their original order in `index.ts`.

- `tenants`: registry/usage, provisioning/developer account, domains, lifecycle and retention.
- `integrations`: signed webhook transport, connections/providers, settings, app licensing, credential status and management/OAuth.
- `approvals`: inbox/decisions and process metadata.
- `flows`: platform events, definition metadata, logs/settings/interviews, email alerts, execution, record debugging and interview resume.
- `apps`, `pages`, `objects`, `security`, `chatter`: app metadata/navigation, route aliases, page listing/updates, object listing, currencies and Chatter access.

Registrars receive only their referenced platform dependencies. Live accessors
preserve mutable state, pending commit promises and provisioning failure state;
the early webhook registrar also defers reads of services initialised later.
No registrar imports `index.ts` at runtime. Type-only dependency contracts follow
the existing Object/Record route convention temporarily; extracting shared service
and metadata types remains part of the Core cleanup.

The extraction preserves URLs, request/response contracts, shared OneEngine RBAC,
tenant lookups, validation, persistence ordering and app lifecycle enforcement.
No new app, SQL schema or seeder is introduced. The five domain-route regression
tests cover permission denial, tenant/navigation filtering, live state replacement,
currency assignment conflicts and tenant-scoped persistence. Run them with
`npm run pretest --workspace apps/server`; the normal server test command includes them.
Existing path-filtered registry, completion, alias and relational CI workflows also
watch `apps/server/src/modules/**`, preserving their coverage after extraction.

Validation on Windows: production `npm run build` passed (189 build-contract tests,
frontend bundles and server compilation). All server test groups passed: 87 workflow/
security tests, 80 supporting contracts, 42 preservation/seeder tests, and five new
route regressions. Server tests use `NODE_ENV=test` and `METADRIVE_TEST_MODE=true`.
Preservation tests resolve asset directories with `fileURLToPath` so paths containing
spaces and Windows drive letters work. The developer-policy guard reports
`index.ts: 13243 -> 11063`; an AST comparison verified unchanged handler logic and
middleware for all 88 extracted endpoints.

## Core and SQL state continuation

Migration owner: `onesolutions-ahuja`, Core phase 6. The follow-up extracts state
responsibilities from the same entry point into `core/state/`:

- `types.ts` and `schema.ts`: platform, tenant and identity contracts and persisted snapshot validation.
- `store.ts` and `response-barrier.ts`: the shared live state reference, latest SQL commit, atomic legacy cache writes and HTTP commit acknowledgement.
- `hydration.ts` and `metadata-read-mode.ts`: legacy-safe snapshot parsing and existing metadata migrations, with strict validation restored after every read.
- `initialization.ts` and `auth-overlay.ts`: SQL-first startup, durable login/logout replay, installed-package reconciliation and maintenance-mode read-only initialization.
- `tenant-defaults.ts`, `tenant-provisioning.ts`, `bootstrap-tenant.ts` and `tenant-data.ts`: existing tenant defaults, serialized durable provisioning, bootstrap, tenant visibility and tenant-scoped persistence.
- `refresh.ts`: scheduler refresh coordination; concurrent state or auth writes prevent replacement by a stale SQL read.

`postgres-state.ts` remains the existing SQL adapter and owns its SQL transaction
queue, normalized/relational snapshots and connection pools. Core delegates to it;
the extraction introduces no alternative persistence engine, SQL schema or seeder.
Typed SQL still rejects a missing database snapshot and never writes a local JSON
copy. Legacy compatibility modes keep their existing behavior. State and tenant
services are wired before the server accepts requests; all route contexts refer
to the same live store. Existing type exports remain compatible; domain metadata
contracts and four inferred factory dependency types still have type-only links
to the entry point, with no runtime import of it.

The entry point decreases from 11,063 to 10,098 lines in this continuation. All 13
new Core state files are below 1,000 lines. Fourteen focused tests cover commit
failure and acknowledgement, SQL refresh races, durable auth replay, tenant and
sequence preservation, maintenance behavior, SQL-only startup and nested parsing.
They run in the normal server pretest alongside the route regressions. Production
build, server compilation and targeted tenant lifecycle/navigation smoke checks
passed; the full server suite and database-backed CI verify the final revision.
