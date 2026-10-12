# RBAC Salesforce-Parity Scope (Frozen)

**Source baseline:** workspace source as finalized 2026-10-07  
**Inventory date:** 2026-10-08  
**Scope:** tenant-scoped security and authorization only. Flow Builder, dashboards as a product feature, and unrelated platform work are excluded. Dashboard/report behavior is in scope only where it consumes RBAC decisions.

This plan retains the three frozen Salesforce-parity workstreams. The previously deferred Phase 3 advanced-sharing work is delivered under **Module 4 Phase 4**; its scoped implementation and verification are recorded below. Full Salesforce security parity beyond these named semantics is not implied.

## Existing implementation

- Profiles, permission sets, permission set groups, direct assignments, group composition and muting, license compatibility, standard-profile protection, and retention of an active security administrator.
- System, object CRUD, field-level, and record-type grants, with current-user permissions refreshed from tenant metadata.
- Roles and role hierarchy; per-object Private, Public Read Only, and Public Read/Write defaults; ownership and hierarchy access.
- User and nested-public-group manual shares; owner-based and criteria-based sharing rules.
- Record authorization and field filtering used by record APIs, reports, and dashboard previews, with flow record access using the same record/object authorization helpers where supported.
- Tenant metadata validation for role/group/rule references, sharing targets, rule fields/operators, and record-type grants.
- Security workspace editors and deep links for the existing RBAC resources.

## Frozen three-phase plan

| Phase | Scope and acceptance boundary | Status |
|---|---|---|
| **1 — Complete and verify the implemented RBAC core** | Close inconsistencies in the already-supported profile/permission-set/group, role, record-type, OWD, public-group, and sharing-rule surfaces. Keep metadata references tenant-valid, ensure Setup Quick Find shortcuts reach the correct security-workspace section, and prove current API authorization behavior with end-to-end smoke tests. No new Salesforce security feature family is introduced in this phase. | **Complete in this task** |
| **2 — Salesforce administration and assignment parity** | Queue membership and protected queue/user ownership transfer; system, application, and tab grants; synchronous Permission Set Group recalculation and muting; tenant-isolated allow/deny tests. | Implemented in PR #152; CI validation required |
| **3 — Advanced sharing and remaining platform semantics** | Restriction rules, implicit sharing, territory access, external/portal-user security, and advanced cross-surface tests. | Implemented as Module 4 Phase 4 in PR #173; staging CI and isolated security tests are the release gate |

## Phase 1 completion record

- Fixed Setup Security shortcuts for **Public Groups** and **Sharing Rules**, which previously fell through to Setup Home instead of opening their RBAC sections.
- Added API smoke assertions that reject a sharing rule with an unknown criteria field, a target user outside the tenant, or an operator incompatible with its field type.
- Kept authorization enforcement server-side; navigation only selects the matching setup section and does not grant access.
- Validation: `npm test --workspace apps/server`, `npm run build --workspace apps/server`, and `npm run build --workspace apps/web` all pass.

## Explicit non-goals and known gaps

- Flow Builder and unrelated product capabilities are not part of this plan.
- Phase 1 does not claim full Salesforce parity or add queue, external-user, restriction-rule, implicit-sharing, or Enterprise Territory Management features.
- Any newly discovered RBAC gap must be assigned to Phase 2 or 3; do not silently widen Phase 1.

## Phase 2 implementation notes (2026-10-12)

- Queue membership supports individual users, roles, subordinate roles, and nested public groups. The dedicated `POST /api/records/:objectName/:recordId/transfer-owner` operation validates tenant-local active user/queue ownership, edit and transfer authority, and clears manual shares on ownership transfer. Generic record updates still reject OwnerId changes.
- Profiles can explicitly hide apps/tabs, permission sets can restore specific visibility, and permission set group muting applies only to the group's contribution. Existing tenants without configured app/tab restrictions retain existing navigation. App/page API endpoints enforce server-side navigation checks; object CRUD, field- and record-security checks remain independent.
- Permission Set Groups are resolved synchronously when tenant RBAC is saved. Calculation status and last calculated timestamp are recorded as Updated, and the versioned tenant state immediately invalidates cached effective grants. No background worker, pending recalculation queue, or per-request database lookup is added.
- `navigation-rbac.smoke.test.ts` covers changes to profile, set/group muting, stale-grant prevention, direct-URL denial, invalid app references, owner transfer and queue/tenant isolation.
- Final CI and deployment performance results are acceptance evidence, not implied by this source-only record. This phase does not cover advanced sharing, full Salesforce parity, or an unverified platform-assisted tenant rescue ceremony.

## Module 4 Phase 4 — Advanced access implementation (2026-10-12)

- Restriction rules are tenant-/object-bound, schema-validated and configured alongside existing sharing settings. Enabled rules narrow owner, hierarchy, manual-share, public/default and View All/Modify All grants in the central record authorization function. Rule subjects include individual users, roles, external users and all users; conditions support all/any combinations, scalar comparisons, membership and null checks. Unknown fields, foreign tenants/roles/users and duplicate rules are rejected.
- Master-detail parent access remains implicit and recursive with cycle protection; a new relationship resolver validates additional parent-to-child and territory authorization inputs without granting object or field permissions.
- Read-only record territory grants consult tenant-validated territory hierarchies and memberships when a record has a matching TerritoryId. Territory ownership and write grants are not inferred from viewer memberships.
- External-user metadata requires a tenant-local Account ID. The authenticated API allows only account-scoped GET record/list and self-identity operations for those users; other Setup, Named Credentials, reporting and mutation routes are explicitly blocked. Portal access is disabled unless configured for the object.
- The existing Security workspace exposes restriction editors, portal object settings, and user-type/account-boundary assignment, using the existing tenant RBAC management permission and tenant versioned-state persistence. Other tenants cannot refer to these users or rules.
- API-level regression coverage verifies restriction enforcement against privileged users, updates and invalid cross-tenant rules, plus immediate permission refresh and portal-user route isolation. Additional pure-function tests cover cyclic territory graphs, cross-tenant relationships and default-deny behavior.
- No additional infrastructure or external service is required. Code review and CI evidence determine merge readiness. These controls do not claim Salesforce Enterprise Territory Management or an independently operated multi-identity portal product.
