# RBAC Salesforce-Parity Scope (Frozen)

**Source baseline:** workspace source as finalized 2026-10-07  
**Inventory date:** 2026-10-08  
**Scope:** tenant-scoped security and authorization only. Flow Builder, dashboards as a product feature, and unrelated platform work are excluded. Dashboard/report behavior is in scope only where it consumes RBAC decisions.

This plan fixes the remaining work into three phases. Phase 1 is the only phase authorized for implementation in the current task. Do not expand Phase 1 into later-phase features. Salesforce parity is not claimed until the outstanding phase acceptance criteria are implemented and verified.

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
| **2 — Salesforce administration and assignment parity** | Add queue membership and queue record ownership/assignment semantics; define and enforce the remaining in-scope Salesforce system, application, and tab permissions; implement Permission Set Group recalculation/status and assignment lifecycle behavior where the platform supports asynchronous recalculation. Acceptance requires tenant-isolated configuration and end-to-end allow/deny tests for each surface. | Pending |
| **3 — Advanced sharing and remaining platform semantics** | Add restriction-rule evaluation and supported implicit sharing semantics; complete Salesforce-compatible territory access rather than the current dashboard-folder territory audience; add external/portal-user sharing semantics and remaining RBAC permission surfaces identified by the Phase 2 inventory. Acceptance requires cross-surface record/API/report/dashboard authorization tests, including isolation and revocation. | Pending |

## Phase 1 completion record

- Fixed Setup Security shortcuts for **Public Groups** and **Sharing Rules**, which previously fell through to Setup Home instead of opening their RBAC sections.
- Added API smoke assertions that reject a sharing rule with an unknown criteria field, a target user outside the tenant, or an operator incompatible with its field type.
- Kept authorization enforcement server-side; navigation only selects the matching setup section and does not grant access.
- Validation: `npm test --workspace apps/server`, `npm run build --workspace apps/server`, and `npm run build --workspace apps/web` all pass.

## Explicit non-goals and known gaps

- Flow Builder and unrelated product capabilities are not part of this plan.
- Phase 1 does not claim full Salesforce parity or add queue, external-user, restriction-rule, implicit-sharing, or Enterprise Territory Management features.
- Any newly discovered RBAC gap must be assigned to Phase 2 or 3; do not silently widen Phase 1.
