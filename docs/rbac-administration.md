# SQL RBAC administration

OneEngine is an ordinary, configurable permission set. The RBAC evaluator is shared by
HTTP authorization and SQL record selection; there are no developer/email exemptions.

## Editor and SQL contract

GET /api/metadata/permissions returns a tenant-scoped snapshot with a revision.
PUT accepts that complete snapshot, validates all supported fields, locks the tenant,
rechecks authority, and commits policies and assignments atomically. Stale revisions
return HTTP 409. Invalid references, cycles and unknown fields fail without saving.
The compatibility /sets endpoint accepts this same complete contract.

Profiles use ordinary permission sets for their editable rules. Existing profile-to-set
links remain separate and visible as inherited permission sets. Changing the primary
role preserves additional legacy role memberships when the primary role is unchanged.
Policy set deletion must satisfy memberships and SQL dependencies. Queues owning
business records cannot be removed. Reserved OneEngine and PlatformDeveloper identities
cannot be renamed/deleted through this editor.

System, Object, Field, Record Type, App and Tab grants are relational permission rules.
Unchecking a normal grant revokes that grant; full starting access uses explicit deny
rows for unchecked permissions. Advanced rules expose custom denials and scoped
wildcards. Explicit denies override all applicable allows. Group mutes remove only
allows contributed by that group; direct grants remain effective, while explicit denies
in any assigned policy still take precedence. No cached materialization delays revocation.

## Assignment and delegation boundaries

Security read/manage are required to save. Changing another user's security assignments
also requires User edit. Own role/profile/set/group assignments cannot be changed.
An actor cannot delegate a new grant or restore a denial beyond their own authority.
The transaction checks for indirect increases in the actor's effective permissions and
record access, and verifies that Security read/manage remain available before commit.
A second authorized administrator restores an actor's revoked permissions. An administrator
retaining existing broad data grants can remove a record restriction without creating new
Object/Field grants, so tenant-wide restriction policies remain recoverable.

PlatformDeveloper administration and assignment require that separate platform authority;
tenant administration cannot manufacture it. Platform lifecycle/support access continues
through the existing separately scoped, audited service. Generic User CRUD manages user
identity only; its role field directs administrators to Users & Assignments.

## Record and navigation enforcement

Record list pagination and totals filter in SQL before returning rows. Reads, edits,
deletes, ownership changes, history and collaboration use the same record policy.
Flows and reports continue to use RecordEngine. Owners, queue members, hierarchy,
organization defaults and sharing rules can grant access, bounded by Object/Field/Record
Type grants and explicit denials. Applicable restriction rules narrow all record grants.
New records receive the creating user as owner unless an authorized owner is supplied.
Default and explicitly selected record types both require access.

Public groups support users, roles, roles with subordinates and nested public groups.
Sharing rules support owner-based and field-criteria-based grants. Restriction conditions
and list values are stored in separate relational rows. External portal users are
read-only, denied Setup, and confined to their verified tenant Account relationship.

App permissions filter available installed/licensed app navigation; Tab permissions
filter Object navigation and record-list route aliases. Data APIs still require their
own data permissions. App installation, active entitlements and expiration checks remain
independent of RBAC grants.

## Validation

GitHub Actions runs npm run check, existing SQL/HTTP smoke tests, and rbac-sql-smoke.mjs
against disposable PostgreSQL. The RBAC matrix covers profiles, groups, assignment
revocation, deny/restore, sharing, queues, record types, stale revisions, rollback,
tenant isolation, migration idempotency, data preservation and app licensing.
The Chromium smoke uses actual editor Save buttons and checks refresh/SQL persistence
for profile creation and permission-set metadata. It retains an RBAC editor screenshot.

No production or customer database is used by these tests. Production deployment and
health verification require all mandatory checks to pass.
