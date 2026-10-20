# Metadata Package Retrieve and Deploy

MetaDrive supports portable metadata package artifacts for selected custom Objects and Fields, Object Manager settings and page layouts, Lightning Pages, tenant library Components, Flow definitions, and permission-set definitions. Artifacts use `metadrive-metadata-package` schema version 1, a SHA-256 integrity digest, explicit dependencies, and a 1 MB size limit. They do not contain tenant records, credentials or their secrets, user assignments, or source-tenant identifiers. Layout IDs, record-type IDs, profile IDs, permission-set IDs, and Flow Named Credential IDs are mapped to portable names and resolved in the destination tenant.

## Package lifecycle endpoints

- `POST /api/metadata/packages/export` exports selected `objects`, `objectConfigurations`, `pages`, `components`, `flows`, and `permissionSets` API names along with package name, label, version, and type (`Managed` or `Unlocked`).
- `POST /api/metadata/packages/preview` validates an artifact, checks dependencies and ownership conflicts, and reports preserved Unlocked customizations.
- `POST /api/metadata/packages/install` applies an artifact after preview validation.
- `GET /api/metadata/packages` lists tenant-local installation receipts.
- `POST /api/metadata/packages/:apiName/uninstall` disables package pages, deactivates Flows, and retains Objects, Object Manager settings/layouts, and permission-set definitions. Components still referenced by tenant metadata are retained; unused package Components are disabled.

All operations are tenant-scoped and require the applicable metadata read/create/manage grants. Permission-set deployment uses the central revision-checked RBAC administration workflow, preserves destination assignments, and subjects new grants to the existing delegation checks. Package installation is transactional and audited. Managed package-owned metadata is protected from edits through the existing metadata APIs; Unlocked package upgrades preserve tenant customizations. Flow definitions deploy as Draft and must be independently validated and activated through normal Flow controls. Named Credentials are never packaged; Flow references are matched by credential name in the destination tenant. Field type changes require a separate explicit migration.

## Scope and compatibility

Package installation adds or upgrades the supported metadata types and does not copy profile/user assignments or secrets. Flows with tenant-specific UUID literals are rejected as non-portable; remove those literals or map them to Flow resources before export. Page-layout assignments map profile API names, record-type developer names, and layout labels; preview blocks installation when the destination profile is missing or a referenced layout/record type cannot be resolved. Object/record type changes that would invalidate stored records are rejected by the existing metadata engine.

The artifact format is MetaDrive-specific and is not Salesforce Metadata API XML or full Salesforce package compatibility.
