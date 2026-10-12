# Module 3 — Production security verification (without SMTP)

Verified on **2026-10-12** against the running **Aiven PostgreSQL `oneengine`** service using read-only catalog and aggregate queries. No customer record values or session token hashes were accessed.

## Tenant isolation (3.4)

- The existing relational database `metadrive_sql_20261012` reports migration revision **1** (applied 2026-10-11). The current `relational-state-v1.sql` is revision 1; do not invent revision 2 or rerun a migration that is already applied.
- There are 13 `metadrive_rel_*` tables. Relational foreign keys include users → tenants, objects → tenants, record buckets → tenants, records → same-tenant record buckets, tenant settings → tenants, collection items → same-tenant collections.
- At observation: 1 tenant, 1 user, 14 records, 659 refresh-session records. **Zero orphan users, zero orphan records, zero orphan collection items, zero refresh sessions without a matching user, zero cross-tenant refresh sessions.**
- The relational tables did not have PostgreSQL row-level security (RLS) enabled. Tenant isolation currently depends on API authentication/authorization, consistent tenant-scoped keys and relational constraints. **Do not claim row-level security is active.** The existing cross-tenant test suite establishes application-layer rejection, while the production observation spans only one real tenant and is not a substitute for a two-tenant production-safe exercise.
- No tenant data migrations or writes were performed in this verification.

## Emergency recovery (3.7)

- The **separate** database `metadrive_recovery_control` has eight recovery control tables. They were verified present.
- The managed SQL console tool explicitly prohibits `CREATE FUNCTION`, `GRANT` and `REVOKE`; the append-only audit trigger and least-privilege runtime role therefore **cannot be installed through that interface**. At observation there was no recovery audit trigger and no recovery runtime role. Do not use the main tenant application's `avnadmin` credential as a substitute.
- A dedicated audited migration script is provided at `apps/server/scripts/provision-recovery-controls.mjs`. It is intentionally **opt-in**, never part of normal server startup or Render auto-deploy. It installs the official schema, protected event trigger and restricted role transactionally, verifies access as that role, and prints no connection strings or passwords.
- The recovery API now checks its database identity, table availability, append-only trigger, runtime role privileges and non-ownership **before every request**. Missing any prerequisite returns HTTP 503, irrespective of UI, platform role or activation flag. This adds a defense against premature or accidentally enabled production recovery.
- The deployment should keep `METADRIVE_RECOVERY_ENABLED` unset/false while independent encrypted email delivery is not configured. **No SMTP account is required to keep the remaining Module 3 platform features working.**
- To finish the database hardening when privileged database access is available, supply `METADRIVE_RECOVERY_MIGRATION_DATABASE_URL` (privileged URL targeting `metadrive_recovery_control`) and a unique 32+ character `METADRIVE_RECOVERY_ROLE_PASSWORD` **privately** to a trusted operator shell, then run:

  ```bash
  node apps/server/scripts/provision-recovery-controls.mjs --apply
  ```

  Never paste the URL/password into GitHub, application logs, issues or chats. This script does not add a paid service. Only after successful verification should a recovery-specific runtime connection be installed on Render, and even then recovery remains disabled until private delivery, independently enrolled contacts and two MFA-enrolled platform operators are available.

## Completion rules

Module 3.1–3.6 and 3.8 are delivered in `main` with CI. The reversible recovery centre (3.7) is delivered in `main`, but **live emergency recovery is not activated without SMTP and independently verified contacts**. Destructive tenant erasure is intentionally excluded from 3.6, pending separate legal-hold and deletion-policy authorisation. No hard usage quotas, monetary billing or measured byte metering were implemented in 3.8; warning targets are informational.

Do not mark production emergency recovery fully operational from a merged PR or staging success alone.
