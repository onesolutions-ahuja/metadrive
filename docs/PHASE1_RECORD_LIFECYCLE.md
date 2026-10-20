# Phase 1 — Generic Record Lifecycle and Recovery

## Unified Core contract

The SQL Record Engine remains the only generic CRUD implementation. Records use
`md_records.is_deleted` and a deletion group to preserve business data and
Master-Detail hierarchies until authorised permanent purge. User deactivation is
not a record soft deletion. Field-definition recovery is a separate lifecycle.

- `GET /api/records/:objectApi` excludes tombstones and supports verified
  `relatedField` + `relatedId` as an additional relationship-scoped predicate.
  Both Object and Field read permission and parent Record access are checked.
- `DELETE /api/records/:objectApi/:id` soft-deletes a root and eligible
  Master-Detail children transactionally; Lookup Restrict prevents deletion.
  Lookup Clear/Hierarchical references are nulled, with their former target
  stored in `md_deleted_lookup_links` for possible restoration.
- `GET /api/recycle-bin/records/:objectApi` lists recoverable root records
  only. `POST /api/recycle-bin/records/:objectApi/:id/restore` requires
  applicable Object create/delete and Record delete permissions throughout
  the group. Restored lookup values never overwrite a user edit. Unresolved
  ledger entries are retained for manual reconciliation.
- Deleting a record releases its unique Field values; restoration rechecks
  unique constraints atomically. A collision blocks restoration with a clear
  error while preserving the entire deletion group.
- Search, record detail, typed filtering, summaries, reports using generic CRUD,
  Flow queries, collaboration and roll-ups exclude inactive records. Normal
  record deletion leaves associated activities, attachments, approvals, Chatter
  and field values untouched, avoiding FK breakage.

## Record retention: destructive operations require opt-in

A tenant can explicitly configure its policy in the browser Recycle Bin.
`GET/PUT /api/recycle-bin/retention` requires `Security:manage`. Defaults:
15 days of retention, **automatic permanent purge disabled**. Changes are
persisted in `md_record_retention_settings` and audited in
`md_record_retention_audit`. Nothing is auto-purged merely because a migration
or new application is installed.

The hourly SQL cleanup checks opted-in settings and uses the configured
administrator as the effective user; current Security/Object/Record permissions
are rechecked each time. The explicit
`DELETE /api/recycle-bin/records/:objectApi/:id/purge` is also restricted to
authorised administrators and enforces elapsed retention.

Permanent purge is an intentional, irreversible operation. It deletes the
expired root/group, dependent activities, Chatter/posts/comments and completed
approval requests, while retaining lifecycle audit rows. It fails closed if
retention has not expired, approval requests are still pending, another group
or record references the target, permissions are revoked, or database integrity
blocks deletion. These cases are reported, not silently bypassed.

**Recovery safety:** Tombstones do not replace normal tenant SQL backups,
point-in-time recovery, or separate platform audit-retention obligations.
Regulated tenants must select a suitable retention policy. Restoring older
lookup links is conditional on Field existence, current permissions and absence
of intervening changes; omitted links remain in the SQL recovery ledger.

## Database changes

- `20261105-record-recycle-bin.sql`: tombstones, groups, lookup recovery,
  lifecycle audit, active-record RBAC rules, active-only unique indexes.
- `20261106-record-retention.sql`: opt-in retention policy plus change audit.
- The fresh-install `schema.sql` contains the same SQL objects.
- Migrations are additive, versioned and checksum-validated; no existing
  business records are deleted as part of upgrading.

## Validation gates

`npm run check` runs unit tests, architecture checks, backend/frontend builds
and lazy loading rules. The GitHub SQL System Validation runs migrations
twice, real PostgreSQL SQL smoke (including related-list isolation,
Master-Detail/Lookup delete/restore and uniqueness), RBAC and HTTP smoke,
database recovery, plus Chromium Builder/Records browser smoke.

All checks, including actual tenant/Record/Field permissions and persisted
Recycle Bin configuration, must pass before merging Phase 1.
