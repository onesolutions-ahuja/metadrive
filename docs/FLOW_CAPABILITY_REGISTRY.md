# Core Flow Capability Registry — Phase 0

The Core Flow Builder and production SQL validator read the **same relational SQL capability catalogue**. This avoids independent toolbox and validator allow-lists. The initial migration intentionally preserves previously available tools; Phase 1 will switch more flags on only after their runtime and test contracts pass.

## Storage and lifecycle

- `md_flow_capability_flow_types`: type descriptions and separate creation, validation, debugger flags.
- `md_flow_capability_elements`: element identity, group, icon, version, UI enablement, before-save eligibility, config schema key, validator key, runtime handler key, debug behaviour and optional app ownership.
- `md_flow_capability_element_flows`: valid flow-type combinations and UI editing eligibility.
- `md_flow_capability_properties`: typed, relational configuration property descriptors. Existing full per-element validators remain authoritative until each descriptor is migrated in a later phase.
- Versioned additive migration `20261112-flow-capability-registry.sql` seeds baseline **Core** capabilities with `ON CONFLICT DO NOTHING`. Fresh-install schema includes the tables. There are no JSON/JSONB capability documents and no changes to existing customer Flow definitions.
- Optional app capabilities require an active tenant installation and entitlement to be returned. Authorisation always runs through the existing RBAC engine. No app-specific runtime is initialised by opening Flow Builder.

## Runtime contract

`GET /api/metadata/flow-capabilities` requires `FlowDefinition.read`, is uncached and loads only when the Flow Builder mounts. A missing/denied capability request fails closed in the builder. `validateFlowDraft` uses the SQL registry in production to reject unregistered elements or invalid flow-type combinations, including before-save restrictions. Its no-DB path is retained solely for isolated existing unit tests, since production `FlowRuntime.validateDraft` always supplies SQL.

`builder_enabled` controls toolbox visibility; `builder_allowed` permits property editing for a matching Flow type. This distinction preserves editing of imported Publish Platform Event nodes without exposing a new toolbox tool prematurely.

Keys such as `runtime_handler_key` and `validator_key` reference existing trusted backend implementations, **not** arbitrary SQL-supplied executable code. Per-element business behaviour stays outside Core. The `debug_behavior` flag documents current support, including incomplete debugger coverage; Phase 2 will consolidate debug dispatch.

## Release gates

1. Fresh schema + migration and migration re-run must succeed without replacing existing capability rows.
2. FlowBuilder must fetch capabilities only when open; login and app runtimes must never request them.
3. SQL permission denial, missing entitlement and unregistered types fail closed.
4. Existing active published Flow runs, version history and tenant data remain unchanged.
5. Run `npm run test:unit`, `npm run build`, `npm run check`, PostgreSQL integration, and browser Flow setup smoke before merging. Green static tests alone do not establish release readiness.

Phase 1: expose already-implemented data and trigger tools after targeted validation, debug status reporting and authenticated browser tests.
