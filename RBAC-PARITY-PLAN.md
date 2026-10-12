# RBAC Salesforce-Parity Scope (Frozen)

**Source baseline:** workspace source as finalized 2026-10-07  
**Inventory date:** 2026-10-08  
**Scope:** tenant-scoped security and authorization only. Flow Builder, dashboards as a product feature, and unrelated platform work are excluded. Dashboard/report behavior is in scope only where it consumes RBAC decisions.

This plan retains three phases. The Module 4 authorization work of 2026-10-12 permits Phase 2 implementation while **Phase 3 advanced sharing/restriction rules remains explicitly deferred to the last phase**. Salesforce parity is not claimed until that future scope is implemented and verified.

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
| **3 — Advanced sharing and remaining platform semantics** | Restriction rules, implicit sharing, territory access, external/portal-user security, and advanced cross-surface tests. | Deferred to last phase at user's request |

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
