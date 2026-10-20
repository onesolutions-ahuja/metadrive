# OpenAPI External Services in Flows

Tenant administrators can import an OpenAPI 3.0 or 3.1 JSON document from the Flow Builder Action editor. Imported operations are stored as tenant-scoped relational metadata and can be selected as reusable Flow Actions. The source document, credentials, and customer data are not stored.

The importer accepts a single HTTPS server and up to 500 operations. It supports `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`; inline primitive path and query parameters; and optional JSON object request bodies. References (`$ref`), per-operation servers, headers/cookies, callbacks, webhooks, and non-JSON or non-object request bodies are rejected. Re-importing a service replaces its operation catalog; existing Flows are validated against the current catalog when activated and fail clearly if a selected operation was removed.

An action selects an enabled tenant HTTPS Named Credential, maps path/query values to literals or Flow resources, and optionally maps a JSON body. Callouts enter the existing durable HTTPS callout queue and use its authentication, origin/DNS protections, permission checks, retry policy, encryption, and audit behavior. The operation response is not returned to the Flow; use an HTTP Callout element for the existing supported response behavior.

Import and catalog endpoints:

- `POST /api/metadata/external-services/import` with `{ "apiName", "label", "spec" }`
- `GET /api/metadata/external-services`

Both endpoints require Flow Definition permissions. Importing requires `FlowDefinition:manage`; executing an action additionally requires `NamedCredential:read` and `HTTPCallout:execute`, and the referenced HTTPS credential must be enabled in the same tenant.
