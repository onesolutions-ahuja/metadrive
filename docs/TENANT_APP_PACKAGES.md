# Lightweight, tenant-scoped AppExchange packages

MetaDrive deploys one shared Core and one central AppExchange catalogue. A tenant
that installs 10 of 100 available apps gets **ten SQL installation rows**, not
100 copies of application JavaScript. The generic renderer and Flow engine
remain shared. App-owned metadata loads only for installed, entitled tenants.

## Published package registry (operator/publisher)

- `md_apps`: central catalogue identity. The tenant-owned catalogue is separate.
- `md_app_package_versions`: versioned, publishable manifests. A release
  publisher inserts rows with `published=false`, fills dependencies, typed
  resource templates and navigation, verifies them, and only then marks it
  published. Treat published versions as immutable; publish a new version for
  changes. Existing legacy `md_apps` without manifests retain their previous
  installation behavior until migrated.
- `md_app_package_dependencies`: other already-installed, actively licensed
  versioned apps required by the package. Dependency presence/version is
  validated transactionally. Dependencies are **never auto-installed** or
  auto-licensed; the tenant must explicitly choose them.
- `md_app_package_object_templates`, `_field_templates`,
  `_component_templates`, `_page_templates`, `_home_page_templates` and
  `_page_component_templates`: declarative SQL-backed templates.
  These materialise only when that tenant installs the app. Components reference
  platform renderer keys, not tenant-executable packages.
- `md_app_package_resources`: required existing tenant Objects, Fields,
  Components, App Pages and active Flows. Missing references abort installation
  without a partial commit. Flows with complex published graphs must currently
  be supplied by an existing independent, validated package seeder and declared
  here as requirements; this installer does **not** clone arbitrary Flow graphs.
- `md_app_package_navigation`: suggested Object/Page navigation added without
  replacing the tenant's edits.

A publisher must ensure its package contains everything referenced by pages,
Flows, actions, RBAC and components. Use the existing versioned app seeder for
specialised typed metadata not represented by these templates; never embed
app-specific logic in shared Core.

Package resource declarations verify install prerequisites; they do not grant
Object, Field or Flow permissions. Runtime access remains governed by central
tenant RBAC. The SQL publisher script is an operator workflow, not a separate
security boundary; authoring/import tooling can streamline it without changing
those runtime checks.

## Tenant lifecycle

1. Tenant sees central AppExchange catalogue and its current licence status.
2. An authorised licence administrator can grant an entitlement separately.
   Licence grants never automatically install an app or start a trial.
3. The Install button calls `POST /api/apps/:apiName/install`. The backend
   checks tenant, permission, entitlement/expiry and published dependencies.
4. In one SQL transaction, only the chosen version's templates are seeded,
   requirements validated, installation and version receipt saved, and
   tenant-owned app metadata/navigation created. A package-declared Home Page is
   assigned only when no tenant assignment exists for that app and form factor.
   Shared references stay shared.
5. Opening an app loads generic published runtime and its SQL metadata.
   The connector settings UI is dynamically imported only when opened.
6. A later published version can be applied through the same Install endpoint:
   seeders are idempotent and preserve edits. Downgrades are rejected.
7. Uninstall cancels app-owned queued jobs, removes the tenant installation
   and version receipt, and refuses removal while another installed app depends
   on it. Tenant business records, previously seeded metadata and shared
   dependencies remain. Licence grants remain distinct from installation.

## Release and performance acceptance

Before claiming lightweight runtime parity, test **Core only**, 1 installed
app, 10 installed apps and a mixed-app tenant. Check web Network tab chunk
requests, login payload, page metadata and render times, Node RSS/heap,
worker queues and p95 SQL/HTTP response latency. Verify cross-tenant isolation,
permissions and dependency uninstall failures. Uninstalled app JS must not be
initialised by the tenant page. However, a shared Node process does **not**
provide hard tenant-specific CPU/RAM limits; dedicated resource quotas require
separate hosting/worker isolation or a scheduler with measured budgets.

## Remaining publisher capabilities

The relational package registry and transactional installer do not yet provide
browser-based **package authoring/export**, full Flow graph and permissions
publishing, database-backed package archive/signature verification, or measured
CPU/RAM quotas. These must be validated and completed before advertising
arbitrary third-party packages as one-click installs. Do not mistake a package
manifest for an operationally validated app.

## App catalogue classification

`md_apps.app_type` distinguishes launchable `Application` packages from non-visual `ConnectorApp` packages. `Application` is the default for existing and tenant-authored apps. Connector seeders register `ConnectorApp`; the idempotent migration backfills the six existing connector packages without changing installations, licences, credentials or customer records.

AppExchange discovery and lifecycle management show both types and group them as **Applications** and **Connector Apps**. The app dropdown, App Manager and login bootstrap read only installed, entitled `Application` packages. Connectors stay available to shared Flows, HTTP callouts and Named Credentials through their existing installation lifecycle, but do not create a launchable navigation entry.
