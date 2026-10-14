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
