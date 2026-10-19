# MetaDrive V2.0 — Three-part audit release evidence (2026-10-19)

**State:** Remediation merged; release security certification **not complete**. This evidence is intentionally read-only and makes no assertion that unexecuted operational tests passed.

## Verified evidence

| Gate | Evidence | Result |
| --- | --- | --- |
| PRs #677 and #680 | GitHub merged pull-request metadata, 2026-10-19 | Merged |
| Current main commit | `c803bae3f5b1da3252247d8d1212bf14a1d83922` | Verified |
| Pages Release | Actions run [39198882267](https://github.com/onesolutions-ahuja/metadrive/actions/runs/39198882267): verify + publish success, `npm run check` passed | Passed |
| Newer SQL System Validation | Actions run [39200748291](https://github.com/onesolutions-ahuja/metadrive/actions/runs/39200748291) on SHA `a9883781b` | Passed; older failure superseded for tested commit |
| Earlier SQL System Validation | Actions run [39198767686](https://github.com/onesolutions-ahuja/metadrive/actions/runs/39198767686) on older SHA `62721fbe0`: TypeScript errors referencing dashboard-sharing fields | Historical failure; **not** proof current main fails |
| Aiven | Project `ahujavishalkumar-a080`, service `oneengine`, DB `metadrive_sql_20261012` | Running |
| Tenant-scoped record-type FK | `pg_constraint.convalidated` for `md_records_record_type_tenant_object_fk` | true |
| Migration ledger | `md_system_migrations` | 40 rows, latest applied 2026-10-19 04:19:55 UTC |
| Product anomalies | `md_records` filtered to `object_api='Product'` | 10/10 missing `owner_id` and `record_type_id` |
| Product record types | `md_object_record_types` | One active default `Master` (`master`) for affected tenant |
| Product ownership provenance | `md_record_history` join on missing-owner Products | 0 entries; ownership cannot be established from this history |
| Actual RLS state | `pg_class.relrowsecurity` for `md_records`, `md_record_values`, `md_users`, `md_system_definitions` | false on all four; explicit security architecture approval required |
| Available tenancy | `md_users` aggregate | 1 tenant and 1 user; insufficient for two-tenant restricted-role test |
| Production deployment | Railway service `metadrive`, deployment `e1442f1a-dab3-4317-a553-c40d70866748` | SUCCESS |
| Railway configuration | Production environment | **One unapplied staged service change**; do not apply without reviewing intent |
| HTTP reliability, recent 24h | Railway `http_error_rate` | 3,301 requests, 7 server errors (0.212%), 129 client errors |
| HTTP latency, recent 24h | Railway `http_response_time` | Worst sampled p95 bucket 1,263 ms; not a stress test |

## Outstanding release gates (all require actual evidence)

### P0 — historical Product data reconciliation

1. Determine the authorised owner for each of the ten Products from business owner approval or a reliable upstream provenance record; **never infer from the only existing user, default developer identity, or random allocation**.
2. Obtain explicit approval to use default Record Type `master` for these historical records. Existence of a default is not permission to rewrite history.
3. Record tenant and record identifiers in a protected administrative reconciliation worksheet (avoid personal information in Git).
4. Create a SQL backup/snapshot before the transaction, validate approved user + Record Type belong to same tenant, then update **only** the approved record IDs. Require transactional rollback on any mismatch.
5. Re-run read-only counts and integrity queries, check record-level access, and log the reconciliation in the audit trail.

### P0 — security certification

Provision *two isolated test tenants*, each with an ordinary restricted user and an authorised administrator. Currently the inspected database has only one tenant/user and therefore **does not supply the necessary fixtures**.

Test explicit allow and deny cases for: cross-tenant Object CRUD and joins; Record access; Field read, write and filtering; restricted user administration/RBAC escalation; CORS allowed and rejected origins; unauthorised publishing; developer/support access requiring audited authorisation; licence, installation, activation and RBAC as independent checks. Capture actor, tenant, request, expected status, actual status, and evidence; do not include tokens or sensitive records in artifacts.

### P1 — integration and release gates

- Run Client Credentials and Authorization Code OAuth against authorised live test providers including refresh/revoke/denied scopes; redact tokens.
- Test credential encryption, controlled key rotation and rollback using disposable encrypted **test** credentials; validate no plaintext leakage.
- Verify offline metadata publication, content negotiation, HTTP methods, response schemas, and negative security responses end-to-end.
- SQL System Validation **passed** for SHA `a9883781b` in run 39200748291. Verify its exact tested revision and test coverage for the final candidate; a successful Pages Release `npm run check` alone is not a substitute for SQL smoke and browser tests.
- Check Core startup with optional apps uninstalled, per-tenant installation/licensing/activation, Flow deactivation, seed idempotency, SQL backups, and data preservation.
- Execute non-destructive concurrent-load testing and verify PostgreSQL connections under stated service limits. Railway observational request metrics do not establish pool headroom or stress capacity.
- Review the unapplied Railway production staged change before accepting or discarding it; do not deploy an unknown patch.

### P2 — architecture decisions

**SQL + JSONB:** `SystemDefinitionService` stores stable tenant/kind/API identifiers, revisions and enabled state in relational columns with validated definition properties in JSONB. This is aligned with the policy's intended split *for that service*, not proof the entire platform is compliant. Review all definitions, field query patterns, indexes and update/version behaviour before closing ARCH-01.

**RLS:** Application-layer isolation remains the tracked implementation. Live verification confirms RLS is disabled on `md_records`, `md_record_values`, `md_users` and `md_system_definitions`. Whether PostgreSQL RLS is mandatory requires an explicit architecture/security owner decision. If not adopted, record compensating controls: mandatory tenant predicates in all SQL paths, centralized RBAC enforcement, SQL test guards, tenant-scoped caches/jobs, audit of privileged access and cross-tenant negative tests. Do not silently mark ARCH-02 complete.

## Release decision

**NOT CERTIFIED.** Evidence supports merged remediation, validated FK, SQL migrations, successful latest Pages Release and deployed production service. It does not support certifying cross-tenant security, credential rotation, OAuth provider interoperability, load capacity or historical ownership. Do not rewrite production business records merely to turn a count green.

## Read-only repeatable checks

Run against the confirmed application database `metadrive_sql_20261012`, **not** the default `defaultdb`.

```sql
SELECT conname, convalidated
FROM pg_constraint
WHERE conname='md_records_record_type_tenant_object_fk';

SELECT object_api, COUNT(*) AS unresolved
FROM md_records
WHERE owner_id IS NULL OR record_type_id IS NULL
GROUP BY object_api ORDER BY object_api;

SELECT COUNT(*) AS product_history_entries
FROM md_record_history h
JOIN md_records r ON r.id=h.record_id AND r.tenant_id=h.tenant_id
WHERE r.object_api='Product' AND r.owner_id IS NULL;

SELECT COUNT(*) AS migration_count, MAX(applied_at) AS latest_applied
FROM md_system_migrations;
```


## Verified connection budget and configuration (2026-10-19)

- PostgreSQL `max_connections=15`, `superuser_reserved_connections=3`; **12 is not an assured application allocation** because monitoring, migrations, and administration also consume connections.
- The shared SQL engine defaults to **5 connections per process**, with `METADRIVE_DB_POOL_MAX` as an optional override; each independent worker/replica can create its own pool.
- Railway production currently deploys one replica in IAD, but a second independent worker/process or horizontal scale-up requires a recalculated capacity budget. This is a configuration review, **not** a concurrency-load certification.
- The unapplied Railway service patch modifies source branch/upstream configuration (including clearing `source.upstreamUrl`); leave unapplied pending release-owner review.
- Current application DB has **zero** Named Credential records, therefore there are no existing provider configurations that can be exercised safely for live OAuth/rotation.
- Automated contract tests include `credential-rotation.test.ts` and `oauth-authorization-contract.test.ts`; they use test doubles and do not establish live-provider interoperability.

**Safeguard:** Do not create extra production tenants or test users merely to pass security tests, and do not perform credential rotations against unknown production secrets. Use an isolated test environment with owner-approved fixtures.
