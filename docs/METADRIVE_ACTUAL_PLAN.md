# MetaDrive — Actual Platform Plan and Remaining Roadmap

**Status:** Approved implementation direction. This document records *what we are building and in what order*.  
**Authority:** `DEVELOPER_POLICY.md` governs implementation and security; `AGENTS.md` governs coding agents. This roadmap does not replace either document.

## 1. Goal

Build **one lightweight, universal, tenant-isolated, metadata-driven, no-code platform** that can support **any business application** without changing Core for each use case.

Applications are installable metadata packages built from common Objects, Fields, Relationships, Pages, reusable Components, Actions and Flows. A customer activates only the capabilities they need.

The aim is **not** to create a separate engine for each application, copy an existing enterprise platform in full, or build new application examples before the existing platform has been completed and validated.

## 2. Permanent Architecture

### Universal Core — always available
- Authentication, tenant/session isolation and **one central OneEngine RBAC**.
- SQL-backed metadata resolution, generic Object/Record CRUD, filtering, validation and relationships.
- Shared Component Registry, Renderer and property/binding/event contracts.
- Lightweight published Page Runtime, navigation and routing.
- One shared Action/Flow execution runtime, scheduling primitives and durable jobs.
- Generic integration, communication and printing interfaces.
- AppExchange installation/licensing/activation lifecycle and essential platform settings.

Core contains **no application-specific business logic**.

### Optional platform capabilities — loaded only when needed
Visual Builders, specialised viewing/reporting tools, integration providers and other optional modules must be independently loadable. A published page or process must not import its Builder merely to execute.

### Installable applications — metadata-driven
Each application declares its Objects, Fields, Components, properties, Pages, Actions, Flows, navigation, dependencies and OneEngine grants. Installation is tenant-specific and managed by AppExchange. Deactivation/uninstall stops owned routes, jobs and Flows while preserving shared dependencies and customer business records.

### SQL and configuration
SQL is the runtime source of truth for metadata, settings, permissions, installations and business data. Use relational columns for stable/queryable properties and validated JSONB for flexible properties. Seeders are independent, versioned, idempotent, tenant-aware and must not erase user customisations.

## 3. Current Scope and Decisions

- **Finish existing work first.** Reuse previously built engines, the shared component library and existing metadata. Migrate current functionality; do **not** develop new applications during this roadmap.
- **No new application examples or industry-specific builds.** Any application names mentioned elsewhere are illustrative, not delivery commitments.
- **One test tenant** is enough for the agreed installation/combination/reinstallation acceptance journey. Still execute security-focused tenant-isolation checks; a single test tenant does not waive isolation requirements.
- **Universal Data Loader is deferred until next month** and is explicitly outside the current eight steps.
- **No fixed 1,000-line code-file limit.** Prefer clear responsibilities and maintainable modular boundaries; do not revive the removed restriction.
- Avoid repeated repository-wide audits, duplicate PRs and repeated CI calls. Reuse existing verified evidence and rerun tests when affected by changes.
- Do not rewrite functioning modules merely to make their folders resemble a proposed diagram.

## 4. Remaining Eight Steps — execute in order

### Step 1 — Core final cleanup
Finish remaining extraction and bootstrap wiring. Remove duplicate/obsolete code *only after dependency checks*. Keep Core generic and startup lightweight. Preserve existing API routes, published metadata and runtime behaviour.

**Done when:** shared startup is connected correctly, no known duplicate execution path remains, and affected tests/builds pass.

### Step 2 — Universal component finalisation
Finalise the existing registered component library, its configurable styles, layouts, responsive behaviour, accessibility, validation, events and data bindings. Reuse one Registry and property engine. Repair actual parity defects without introducing parallel renderers.

**Done when:** component definitions and property contracts work on every supported surface with focused verification.

### Step 3 — Existing component migration verification
Verify existing published Pages, interactive screens, Dashboards and installed applications resolve the correct **SQL component metadata**, versions, bindings and tenant references. Replace legacy references safely using compatibility mappings; do not destroy still-referenced registrations.

**Done when:** migration is verified end-to-end and no broken component references remain in the chosen test tenant.

### Step 4 — Existing Builder completion
Validate and repair the current Page, Flow, Dashboard and Report Builders using the common Component/Metadata services. Ensure editing, preview, publishing and published runtime remain distinct. No new Builder engines.

**Done when:** existing Builders perform their supported workflows and published content runs without loading Builder code.

### Step 5 — SQL, seeders and OneEngine verification
Validate relational/JSONB metadata, safe migrations, independent seeders, idempotent reruns and central server-side Object/Field/Record/Action/Flow permissions. Maintain separate tenant developer and platform developer policy scopes.

**Done when:** verified SQL persistence and seeder repeatability preserve settings, data and administrator changes.

### Step 6 — AppExchange lifecycle verification
Using **existing modules**, check dependency validation, entitlement, installation, activation, navigation, OneEngine grant seeding, deactivation, uninstall and reinstall. Disabled modules must not load or execute; shared dependencies and records must remain intact.

**Done when:** the complete lifecycle succeeds without a separate engine or destructive state changes.

### Step 7 — Single-tenant end-to-end acceptance
Use **one designated test tenant**: start with Core, install a module, exercise it, install another, verify combined operation, deactivate/uninstall one, confirm the other continues, reinstall and validate preserved data and settings. Include Flows, jobs, component rendering, API permissions and negative isolation/security tests where required.

**Done when:** this complete journey has recorded pass/fail evidence, not merely a successful build.

### Step 8 — Performance, regression and release acceptance
Measure actual startup, login, page transitions, memory and lazy-loading behaviour; investigate root causes against the established performance target. Run the final consolidated relevant security, SQL, frontend/backend, regression and CI checks. Fix found defects, remove verified dead code and document remaining genuine blockers.

**Done when:** the integrated platform meets the agreed functional/security gates and measured performance acceptance, or outstanding exceptions are explicitly documented and approved.

## 5. Execution and GitHub Efficiency

1. Use existing implementation, past inventories, merged work and test results as the baseline; inspect only changed or uncertain areas.
2. Execute complete approved tasks without pausing for routine defects or asking repeatedly to continue.
3. Assign non-overlapping file ownership if multiple agents work in parallel. Reserve shared startup and final integration for the designated integrator.
4. Prefer **one consolidated PR per approved workstream**; do not open a PR for every file, fix or test. Resolve failures and conflicts in the existing PR.
5. Run focused tests while implementing. Run broad end-to-end tests **once after integration**, then rerun only affected checks if a fix requires it.
6. Never bypass OneEngine, omit tenant checks, erase data, or call untested work complete to save CI/API usage.
7. Report succinctly: **Done / Pending / Blocker**, with links or evidence for verified completion.

## 6. Definition of Completion

The roadmap is complete only when the shared Core runs without optional modules, existing components and Builders work from SQL metadata, app installation controls exactly what loads and executes, tenant data survives lifecycle operations, OneEngine security is enforced, and the agreed single-tenant integration plus final regression/performance tests have passed.

**After acceptance:** maintain and migrate existing functionality as required. New applications and the deferred Data Loader are separate future approvals, not automatic next steps.
