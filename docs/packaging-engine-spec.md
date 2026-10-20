# Packaging Engine specification

AppExchange centralises discovery, dependency checks, licensing, tenant installation, versioned seeding, RBAC provisioning, activation, upgrades, deactivation, uninstall and reinstall. Apps are independently installable and must be unloaded when inactive. An app package contains metadata for Objects, Fields, Pages, Components, Actions, Flows, navigation and permissions; shared dependencies must never be deleted by uninstall.

Seeders are versioned, idempotent, tenant-scoped and do not overwrite tenant customisations. Uninstall stops app-specific routes/jobs/Flows while preserving business records and backups. Installation, licensing, entitlement and RBAC remain separate checks.

Existing contracts: [METADATA_PACKAGES.md](METADATA_PACKAGES.md), [TENANT_APP_PACKAGES.md](TENANT_APP_PACKAGES.md), [GUIDED_APPLICATION_SETUP.md](GUIDED_APPLICATION_SETUP.md), [DURABLE_WORKER_RELEASE_RUNBOOK.md](DURABLE_WORKER_RELEASE_RUNBOOK.md).
