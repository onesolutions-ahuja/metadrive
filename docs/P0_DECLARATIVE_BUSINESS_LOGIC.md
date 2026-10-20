# P0 Declarative Business Logic — execution and acceptance

## Shared Core contract

This feature extends the existing SQL-backed generic RecordEngine and existing bounded
Flow formula parser. It does not introduce an app-specific CRUD/Flow engine. Metadata
is tenant/object scoped, persisted in relational SQL, and managed using ordinary
ObjectDefinition/Object RBAC. The browser editor is loaded with Object Manager.

### Create (ordinary records)

1. Check Object create permission and validate submitted fields before reserving a transaction.
2. In one SQL transaction, acquire the object-scoped lock.
3. Apply literal field defaults and then formula defaults (explicit input always wins).
4. Run before-save Record-Triggered Flows, if configured.
5. Run generic typed prepare checks, including field create permissions, required
   fields, picklist restrictions and relationship validity.
6. Evaluate active declarative validation rules in sort order. A Boolean TRUE raises
   a structured page/field error and rolls back the transaction.
7. Insert record and typed values, refresh existing Master-Detail roll-ups.
8. Run after-save Record-Triggered Flows and commit. Failed Flows roll back.
   External effects use existing durable execution semantics.

### Update

1. Check Object edit, record access and submitted field edit permissions.
2. Lock target record and fetch previous values under existing Record/Field read policies.
3. Run before-save Flow if configured, then re-prepare changed fields.
4. Check active Update/Both validation rules against proposed and prior values.
5. Write changed typed values/history, refresh relevant roll-ups, run after-save
   Flow (ordinary API path) and commit.

Flow and Data Loader mutations executed in a caller's SQL transaction also run
the same formula defaults (create) and validation-rule checks. Nested Flow CRUD
continues to suppress recursive record-trigger execution per existing Flow limits.

### Rule semantics

- Formula engine: the existing safe evaluator; **no** JavaScript `eval` or dynamic SQL.
- References: `{!$Record.FieldApi}`, `{!$User.Id}`, `{!$User.Email}`,
  `{!$User.Name}`, `{!$User.TimeZone}`, `{!$Profile.Id}`,
  and `{!$Profile.Name}`; record-change functions `ISNEW`, `ISCHANGED`,
  `PRIORVALUE` use the same Flow runtime.
- Formula defaults are evaluated on create, before before-save Flows; references
  to other calculated defaults are resolved recursively with a cycle guard.
- Formula default targets are bounded to supported scalar types. Read-only,
  compound, encrypted and relationship fields are excluded.
- Active validation formulas must return a Boolean; other result types reject
  the transaction. An error can target a specific field or the page.
- Formula rule references to encrypted/computed roll-up/formula fields are not
  accepted by this P0 implementation. Such dependencies require separate
  secure pre-save projection support.
- The calling actor's Field read rights are enforced when a validation rule
  references a record field; deny must fail closed rather than leak values.
- Active rule metadata updates currently take effect immediately. The rule's
  `active` flag allows staging draft rules before activation.

## SQL and browser acceptance (required before release)

1. On a disposable tenant, apply a fresh schema and the versioned migration twice;
   confirm unchanged schema/metadata and no tenant record loss.
2. Under OneEngine and restricted Object/Field policies, create an Object with
   numeric/text/checkbox fields and open **Object Manager → Validation Rules**.
3. Create an inactive rule, confirm it does not block; activate it and verify a
   TRUE expression returns HTTP 400 with the configured field/page error and
   rolls back all record writes.
4. Verify both Create-only and Update-only rules, rule ordering, ISNEW,
   ISCHANGED, PRIORVALUE, `$User` and `$Profile` references.
5. Configure two formula defaults referencing each other to detect cycles,
   plus one acyclic dependent default; verify explicit values override defaults.
6. Verify ordinary create/update, Flow in-transaction create/update,
   Data Loader create/update, clone, and after-save Flow error rollback.
7. Confirm tenant A cannot read/change tenant B rules or defaults and user
   without configuration authority cannot publish a rule.
8. Verify deleting/changing a referenced field fails closed until rules are
   adjusted. Confirm app deactivation/licensing, SQL backups, and rollback.
9. Run `npm run check`, server PostgreSQL smoke tests, and a complete browser-only
   authoring and record-save acceptance pass. CI alone is not browser signoff.

## Deliberate P1/P2 exclusions and unresolved release work

Dedicated duplicate/matching rules, external-ID upsert, assignment, auto-response
and escalation rule configuration are not provided in this change. Full Salesforce
save-order parity, metadata version-history/restore workflows, and safe
app-specific rule-activation dependencies require follow-up verification/design.
Do not claim full Salesforce parity or production readiness from source tests.
