# Flow execution context contract

Status: **security architecture contract** (not a claim of automatic-trigger runtime support).

## Principles

- A Flow's **API name**, **Flow type**, **execution context**, and **activation state** are independent metadata.
- The shared SQL Flow runtime is the only executor. App-specific code may bind or launch Flows but must not implement a separate workflow engine.
- All Flow definitions, installations, version history, activation and run state are SQL-backed and tenant-scoped.
- OneEngine is the sole authorization service; no role/email shortcut grants access.
- Flow type is selected by the author, not inferred from an API name. Screen, Autolaunched, supported Record-Triggered, Scheduled and Platform Event-Triggered Flows pass SQL activation against their supported capability sets.
- Screen and Autolaunched Flows, and after-save Record-Triggered Flows, can pause at Wait elements. The interview cursor, variables and durable resume job commit together; resumption retains the initiating user and rechecks current authorization and active version. Before-save record-triggered paths cannot wait.
- Record-Triggered Flows can raise a Custom Error to roll back the record transaction. Field-level errors require a tenant-scoped field metadata match and are returned with the field identifier.
- Roll Back Records rolls back SQL mutations to the current interview's start savepoint and continues execution; it cannot reverse external provider effects.
- Decision outcomes support scalar equality/order comparisons, null checks, Contains, Starts With, custom condition logic, and record-trigger-only Is Changed/Was Set checks. Is Changed compares `$Record` to `$Record__Prior`; Was Set matches a blank-to-populated field transition. Unsupported operators and invalid trigger-field references fail activation.

## Permission boundaries

| Operation | Required authority |
| --- | --- |
| Read, build, validate or modify draft metadata | OneEngine Flow definition read/manage policy |
| Publish/activate/deactivate | Explicit authorized Flow management/activation policy, active tenant app and licence |
| Launch a user-invoked Flow | OneEngine named `Flow:<apiName>.execute` grant |
| Read/write business data inside user-context Flow | Current actor's tenant, Object, Field and Record access through shared CRUD |
| Scheduler/event-triggered invocation | Trusted tenant-scoped dispatcher with explicit execution-context policy and activation checks, not the end user's manual Run Flows UI permission |
| Elevated system context | Separately configured scope, least-privilege service identity, audit and administrator approval; never implicit or email-based |

The Builder exposes User and System execution contexts on Start. User Context executes through the initiating actor's current grants. System Context is not a CRUD bypass: activation requires `FlowDefinition.system-context` approval (`flows:system-context`), an enabled tenant automation user, and that identity's named Flow execute grant. The runtime rechecks the recorded approver, service user's current grants, active version, and app entitlement on each invocation and resume; Subflows are checked independently. All Object, Field, Record, tenant, app entitlement, and integration checks remain in force. Initiator, execution actor, and context are retained on each run, and System-context approvals and executions are recorded in `md_flow_execution_audit`. Screen Flows and before-save Record-Triggered Flows reject System Context.

## User-invoked Record Collection inputs

Component event bindings may pass arrays only to declared, input-enabled Record Collection resources in an active Screen or Autolaunched Flow. Each collection is limited to 200 records, each record to 100 scalar fields, and the combined field data to 256 KB. Collection values are persisted in the existing tenant-scoped interview record and record-field tables; no runtime JSON column is introduced. Empty collections remain empty when the interview resumes. Record writes still run through shared CRUD and its current Object, Field and Record permissions.

## Bounded parity boundary

- Page component event actions can launch Screen Flows in the shared screen runner or synchronously execute Autolaunched Flows. Declared input variables map from event fields, record fields, session values or literals. Declared output variables can map to page-local state after synchronous completion; a Flow paused at Wait is surfaced as pending work and does not return outputs to the originating page action. This is not a dedicated inline Flow page component or a general Object Quick Action implementation.
- Get Records, collection mutations and collection processing are bounded to 200 records per operation. Loop/interview execution is bounded to 200 element steps. Collection Assignment supports matching Record resources, Record Collection resources and loop records; scalar assignments support the configured numeric and text operators. Record-resource inputs/outputs must match their declared Object, and Builder validation checks referenced Objects and fields against tenant metadata. Durable record collections are relationally persisted with a maximum of 200 rows per collection, 100 non-system fields per record, 4096 characters per field and 256 KB of field data per collection. Collection Filter and Sort use the supported Flow condition/comparison rules; Transform currently copies directly mapped source fields into new records and returns null for absent fields. Salesforce Transform expressions, joins and unbounded execution are not supported.
- Fault connectors are accepted only from runtime elements that route errors to them, with at most one connector per element. HTTP Callout requires its explicit Fault Path policy to use a fault connector. SQL-backed data operations execute under a savepoint and roll back their operation before following the configured fault path; object, field, record, tenant and current-user authorization continue to apply.
- SQL-backed actions execute in the Flow transaction and route errors through configured Fault connectors after savepoint rollback. External effects cannot be undone by SQL rollback. Worker retries are not equivalent to exactly-once delivery: follow the durable worker reconciliation and single-attempt email rules in the release runbook.
- Quick Actions remain limited to the implemented Set Field Value behavior. Outbound Message and other Salesforce Quick Action behaviors are unsupported.
- Formula support is a bounded parser/runtime subset, not Salesforce formula compatibility. The current accepted function names are `IF`, `IFERROR`, `AND`, `OR`, `NOT`, `XOR`, `ISBLANK`, `ISNULL`, `ISNUMBER`, `ISCHANGED`, `ISNEW`, `ISCLONE`, `PRIORVALUE`, `BLANKVALUE`, `NULLVALUE`, `TEXT`, `VALUE`, `LEN`, `ASCII`, `LOWER`, `UPPER`, `PROPER`, `TRIM`, `LEFT`, `RIGHT`, `MID`, `FIND`, `SUBSTITUTE`, `CONCATENATE`, `EXACT`, `CONTAINS`, `BEGINS`, `ISPICKVAL`, `INCLUDES`, `REPT`, `REVERSE`, `ENCODEURL`, `URLENCODE`, `URLDECODE`, `CHAR`, `INITCAP`, `LPAD`, `RPAD`, `REPLACE`, `CASESAFEID`, `T`, `IMAGE`, `CURRENCYRATE`, `ABS`, `ROUND`, `ROUNDUP`, `ROUNDDOWN`, `TRUNC`, `SIGN`, `MIN`, `MAX`, `MOD`, `SQRT`, `POWER`, `CEILING`, `FLOOR`, `MCEILING`, `MFLOOR`, `EXP`, `LN`, `LOG`, `CASE`, `DATE`, `DATEVALUE`, `DATETIMEVALUE`, `TODAY`, `NOW`, `DAY`, `MONTH`, `YEAR`, `HOUR`, `MINUTE`, `SECOND`, `WEEKDAY`, `ISOWEEK`, `ISOYEAR`, `ADDMONTHS`, `TIMEVALUE`, `TIMENOW`, `PI`, `SIN`, `COS`, `TAN`, `ASIN`, `ACOS`, `ATAN`, `ATAN2`, `SINH`, `COSH`, `TANH`, `DEGREES`, `RADIANS`, `TZOFFSET`, `GEOLOCATION` and `DISTANCE`. Functions outside this list, including Salesforce `REGEX`, `VLOOKUP` and `HYPERLINK`, are rejected. Context-sensitive record-change functions and type/locale behavior remain narrower than Salesforce.

## Automatic-trigger implementation status

1. Versioned tenant-scoped SQL subscriptions now track active Record-Triggered, Scheduled and Platform Event Flow versions, trigger keys and optional app identity. Activation, save, deactivation and archive synchronize subscription state transactionally. Migrations backfill eligible existing active record/scheduled trigger Flows. Platform Events publish into typed SQL outbox rows and dispatch as per-subscriber durable jobs.
   Fresh-install schema and the upgrade migration enforce at most one active version per tenant and Flow API name. The migration deactivates archived versions, keeps the newest remaining active version, and disables subscriptions for inactive definitions; live PostgreSQL migration validation is still required.
2. Scheduled dispatch uses the configured tenant service identity and a durable, idempotent occurrence job. The worker checks enabled identity, installation, licensing, active version/subscription and OneEngine execute permission before starting each run. A system context grant must be explicit and audited. Support tenant-admin revocation without code changes.
   Tenant automation settings store an optional service-user identity in a tenant-scoped relational row and audit changes. Scheduled and Platform Event dispatch use durable workers; an identity is not an authorization bypass.
3. Run the same generic Record Engine for all data mutations, enforcing tenant, record, object and field boundaries. No direct app-specific SQL mutations or shared passwords.
4. Scheduled occurrence keys and Platform Event delivery IDs are idempotent; durable jobs retain the active Flow version and actor. A deactivated/uninstalled app cannot enqueue or continue new scheduled/event work; durable in-flight execution follows the documented reconciliation policy. Failed authorization and execution remain visible in the durable job/delivery state.
5. Prevent recursion and cross-tenant triggers, enforce time/depth limits, and make failed/denied runs observable without leaking business data. Record-trigger dispatch suppresses recursive trigger invocation from CRUD inside a Flow, permits at most 50 matching Flows per record operation, and each interview is bounded to 200 element steps.
6. Wait elements use SQL durable jobs, not browser timers. They are bounded to 365 days, tenant-scoped, transactionally persisted with interview state, and fail closed if the actor, grant, active version or tenant changes before resume. After-save record-triggered waits pause only after all interview state and the durable resume job are enlisted in the record operation transaction.

## Acceptance gates

- Flow Builder creates Start -> End by default; every configured Decision outcome has an editable terminal path.
- Legacy Draft repair is opt-in, idempotent, and preserves user-authored nodes and destinations.
- Validation checks all reachable branches for an End, rejects unsupported capabilities and prevents an End with outgoing connectors.
- Manual execution enforces named Flow execute rights. CRUD actions enforce OneEngine Object, Field and Record rights.
- A triggered Flow cannot gain access solely by being automatic. Test with revoked rights, tenant mismatch, unpublished/inactive versions, uninstalled apps, retries, deactivation and attempted cross-tenant access.
- Production rollout additionally needs passing CI, a real PostgreSQL integration run, an independent security review, and authenticated end-to-end testing of published flows.

Scheduled Flow dispatch currently resolves local times in an IANA zone and supports Once, Daily and every-seven-days Weekly schedules, with a 500-active-schedule scan cap and a 500-record per-run cap. This is not complete Salesforce scheduling. Production SQL validation and authenticated end-to-end release readiness are still required; unsupported automatic Flow capabilities remain disabled, and existing authorization guards are not relaxed.
