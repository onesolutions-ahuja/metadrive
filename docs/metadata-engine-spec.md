# Metadata Engine specification

The metadata engine is the SQL source of truth for Objects, Fields, relationships, Components, Pages, Actions, Flows, navigation and permissions. It supports tenant-scoped drafts, published versions and upgrade-safe reinstallation.

The single metadata runtime reads published definitions and validates relationships, property bindings, permissions and tenant/app lifecycle before rendering or executing. Builders are opt-in editing tools, not runtime dependencies. Records remain in SQL and are not stored as giant mutable JSON documents.

Established contracts: [METADATA_BINDINGS_CUTOVER.md](METADATA_BINDINGS_CUTOVER.md), [METADATA_PACKAGES.md](METADATA_PACKAGES.md), [SQL_RUNTIME_COMPATIBILITY_AUDIT.md](SQL_RUNTIME_COMPATIBILITY_AUDIT.md), [VERSIONED_REST_API.md](VERSIONED_REST_API.md). Follow [DEVELOPER_POLICY.md](../DEVELOPER_POLICY.md) for security and migrations.
