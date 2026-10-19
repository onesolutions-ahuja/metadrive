# Flow execution context contract

Status: **security architecture contract** (not a claim of automatic-trigger runtime support).

## Principles

- A Flow's **API name**, **Flow type**, **execution context**, and **activation state** are independent metadata.
- The shared SQL Flow runtime is the only executor. App-specific code, including ONEpos, may bind or launch Flows but must not implement a separate workflow engine.
- All Flow definitions, installations, version history, activation and run state are SQL-backed and tenant-scoped.
- OneEngine is the sole authorization service; no role/email shortcut grants access.
- Flow type is selected by the author, not inferred from an API name. Currently only Screen and Autolaunched Flows pass SQL activation; unsupported trigger types must continue to fail closed until the corresponding dispatcher and tests are delivered.

## Permission boundaries

| Operation | Required authority |
| --- | --- |
| Read, build, validate or modify draft metadata | OneEngine Flow definition read/manage policy |
| Publish/activate/deactivate | Explicit authorized Flow management/activation policy, active tenant app and licence |
| Launch a user-invoked Flow | OneEngine named `Flow:<apiName>.execute` grant |
| Read/write business data inside user-context Flow | Current actor's tenant, Object, Field and Record access through shared CRUD |
| Scheduler/event-triggered invocation | Trusted tenant-scoped dispatcher with explicit execution-context policy and activation checks, not the end user's manual Run Flows UI permission |
| Elevated system context | Separately configured scope, least-privilege service identity, audit and administrator approval; never implicit or email-based |

## Automatic-trigger implementation requirements (not yet shipped)

1. Persist a versioned per-tenant trigger subscription referencing a published, active Flow version and its installed application's entitlement. Record-Triggered, Scheduled and Platform Event triggers use the shared SQL event/worker infrastructure, not browser listeners.
2. Dispatch with a tenant-scoped actor identity. Evaluate installation, licensing, active version and OneEngine permissions before starting each run. A system context grant must be explicit and audited. Support tenant-admin revocation without code changes.
3. Run the same generic Record Engine for all data mutations, enforcing tenant, record, object and field boundaries. No direct app-specific SQL mutations or shared passwords.
4. Track event/run idempotency keys, source record/version, retries, dead-letter/failure states, and logs. A deactivated/uninstalled app cannot enqueue or continue new work; durable in-flight execution follows a documented cancellation/retry policy.
5. Prevent recursion and cross-tenant triggers, enforce time/depth limits, and make failed/denied runs observable without leaking business data.

## Acceptance gates

- Flow Builder creates Start -> End by default; every configured Decision outcome has an editable terminal path.
- Legacy Draft repair is opt-in, idempotent, and preserves user-authored nodes and destinations.
- Validation checks all reachable branches for an End, rejects unsupported capabilities and prevents an End with outgoing connectors.
- Manual execution enforces named Flow execute rights. CRUD actions enforce OneEngine Object, Field and Record rights.
- A triggered Flow cannot gain access solely by being automatic. Test with revoked rights, tenant mismatch, unpublished/inactive versions, uninstalled apps, retries, deactivation and attempted cross-tenant access.
- Production rollout additionally needs passing CI, a real PostgreSQL integration run, an independent security review, and authenticated end-to-end testing of published flows.

This contract intentionally does **not** enable unimplemented automatic Flow types or relax existing authorization guards.
