# MetaDrive tenant seeding and PostgreSQL recovery

**Do not confuse a fresh tenant with a restored customer database.**

MetaDrive already has separate metadata seeders in `apps/server/src/seeders/core.mjs`, `apps.mjs` and `registry.mjs`. They reuse existing platform metadata and the AppExchange installation lifecycle rather than maintaining duplicate components, Objects, Fields, Flows, pages or permission engines.

For a **new tenant**, create its isolated SQL tenant and authorized initial administrator through the existing provisioning path. Initialize only the shared Core metadata, with no customer accounts, business records, login sessions, secret credentials, or optional apps copied from another tenant. After a tenant installs an optional app from AppExchange, seed only that app's metadata with `installedAppSeed`; its installation, authorization, entitlement, navigation, component and RBAC checks remain mandatory. Uninstalled modules must remain unavailable and unloaded.

For **Dashboard, Reports, Till, POS or future modules**, maintain a stable separate AppExchange package manifest per app as those packages are developed. Include metadata for configurable components and property definitions, Objects/Fields, pages, flows, actions, dependencies, navigation, permissions, versioned migrations and uninstall-retention policy. Re-run seeders idempotently without overwriting tenant customization or business data.

If PostgreSQL is lost, **seeders will not restore customer data**. Recovery requires an independently stored, encrypted PostgreSQL backup with point-in-time restore/WAL retention and regularly tested recovery procedures. Restore customer records, users, grants, secret references and counters from that backup before applying approved metadata migrations. Do not automatically seed starter data over a recovered tenant.
