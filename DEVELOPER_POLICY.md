# MetaDrive Mandatory Developer Policy (v1.0)

All development in MetaDrive MUST follow all 13 rules below. This applies to features, bug fixes, refactors, migrations, application installations, pull requests, and generated code. Inspect existing architecture before implementation. If a requested implementation conflicts with this policy, explain the conflict and obtain the project owner's decision **before implementing the conflicting approach**. Never silently bypass a rule.

## 1. Metadata-driven applications and modules
Use existing Objects, Actions, Flows, registered Components, and other platform metadata for every application/module. Do not hardcode application-specific UI, business fields, workflows, behaviour, or integrations. New generic engine capabilities may be coded when existing primitives cannot support the requirement, but must be registered and made configurable through metadata.

## 2. Reuse arrays, loops, functions and services
Inspect existing code before creating new handlers or renderers. Prefer loops over metadata collections and reusable shared functions to copied component-specific code. Avoid the pattern of separate Kiosk/POS implementations for equivalent components or behaviours. Extend shared abstractions rather than duplicating them.

## 3. Database-backed component metadata
New and modified components must declare configurable properties, defaults, validation, styling, events and bindings through registered database metadata. Generic rendering and property editing must consume those declarations. Avoid hardcoded per-component property handling.

## 4. OneEngine initial RBAC seeding
Every new app/module requires idempotent metadata seeding for all relevant View/Create/Edit/Delete/Execute/Configure/Manage permissions, as applicable, initially granting full management access to the existing OneEngine policy/licence. Normal RBAC enforcement remains mandatory. Administrators can subsequently change grants; re-running seeders must not undo administrator decisions.

## 5. No parallel engines
Reuse the platform Object, Action, Flow, Component, security, and installation engines. Extend them when necessary instead of creating app-specific parallel APIs, stores, renderers, workflow runtimes, or permission systems.

## 6. Metadata-driven navigation and layouts
Drive apps, pages, menus, routes, navigation, device layouts, and page composition from metadata. Do not embed app-specific routes or layouts in platform logic when existing metadata can represent them.

## 7. Shared Object API for data access
Use the generic Object API and metadata relationships for record CRUD, querying, filtering, sorting, pagination, validation, and relationship traversal. Do not add application-specific CRUD endpoints where shared APIs suffice.

## 8. Centralised RBAC enforcement
Authorise server-side operations through the shared RBAC engine for objects, fields, records, pages, actions and flows as applicable. UI hiding alone is not a security control. Metadata configuration and direct API/Flow invocations must not bypass enforcement. Honour tenant boundaries and existing permission mechanisms.

## 9. Metadata-driven events and behaviour
Configure component events (such as click, change, submit and load) to invoke existing Actions or Flows. App-specific business decisions, branching and callouts belong in metadata-configured flows/actions, not hand-written component handlers.

## 10. Versioned, idempotent installers/seeders
Deliver apps/modules as upgrade-safe metadata packages with explicit dependencies and seeders for required objects, fields, components, pages, actions, flows, navigation and RBAC. Install and upgrade must preserve existing customer configuration and administrator-modified permissions.

## 11. Shared component-property engine
Use reusable schemas and property controls for style, layout, responsiveness, visibility, validation and data bindings, with independently editable component instances. Avoid one-off giant components that hide their individual elements from the builder.

## 12. Mandatory architecture and test verification
Before completion or merge, inspect implementation for reuse, metadata usage, central RBAC, seeders/migrations, dependency safety, and regressions. Run applicable tests and CI, report actual results, and do not declare work complete when required verification is missing. Review the full requested scope; do not silently leave partial work.

## 13. Maximum 1,000 lines per code file
Every newly added code file must contain **at most 1,000 lines**. Split oversized files by cohesive responsibility into reusable modules; do not merely move duplication elsewhere or circumvent the limit. Existing legacy files exceeding the limit must be modularised when touched, and progressively reduced through dedicated refactoring. Automated CI must reject new or modified code files above the limit. No automatic exceptions or silent exclusions.

## Mandatory implementation sequence
1. Inspect architecture, registered metadata, security controls, and existing reusable utilities.
2. Reuse or extend shared engines; identify conflicting requirements and seek a decision before conflicting implementation.
3. Configure metadata-driven Objects, Actions, Flows, Components, navigation and properties.
4. Add versioned idempotent seeders, including initial OneEngine RBAC grants.
5. Enforce centralised server-side RBAC and tenant isolation.
6. Keep code files at or below 1,000 lines, splitting by responsibility.
7. Run relevant tests and CI; verify complete scope and report actual status.

## Enforcement
- `AGENTS.md` directs coding agents to this full policy.
- `.github/workflows/developer-policy.yml` runs the changed-code-file size guard on PRs and pushes.
- The line guard can detect file length, but cannot prove architectural correctness. Reviewers and development agents MUST verify rules 1–12. Do not claim CI automatically validates metadata-driven architecture or RBAC semantics.
- Historic over-limit files are not silently approved: the changed-file guard makes any modification to them require modularisation; untouched legacy files are technical debt to be addressed separately.
