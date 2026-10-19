# Phase 3 — No-code Flow operations contract

## Shared capabilities

* **Schedule Trigger:** Once, Daily, Weekly and Monthly; monthly day-of-month recurrence is anchored to the initial date and clamps short months. The approved timezone determines wall time.
* **Before-save records:** Get Records, Loop, Collection Filter/Sort and Transform are read-only or pure. Mutating records, HTTP, Subflows, messaging and waits remain forbidden before-save.
* **Resources and formulas:** Scalar/record resources, typed Subflow mapping, Choice Sets and read-only VLOOKUP over previously fetched collections. VLOOKUP takes `(value, collectionResource, lookupField, resultField)`, scans at most 200 records, and returns a scalar match or null; it does not perform unrestricted SQL.
* **Decisions and queries:** Ends With and Does Not Contain use the existing shared condition and query engines.
* **Provider callouts:** Select an active tenant integration connection and a configured provider operation, or a tenant HTTPS Named Credential. Resource/record bindings and request field maps are authored through the browser. Credential overrides from Flow variables are deliberately blocked.
* **HTTP results:** Synchronous response mapping writes bounded, type-checked scalar values only to declared Flow variables. Durable callouts cannot expose response data to an already-finished interview.
* **Outbound Message Action:** Maps a provider-specific JSON request into the **same** HTTPS callout engine; default mode is the encrypted PostgreSQL durable outbox. Operations such as SMS and WhatsApp require an installed, enabled and properly licensed external provider and its own approved credentials. No native carrier is embedded in Core.

## Runtime security

1. All Flow execution and field/data query operations retain tenant and OneEngine RBAC enforcement.
2. Provider connections and operations resolve using tenant-scoped active SQL metadata. The referenced Named Credential must be tenant-scoped, enabled and HTTPS; its origin must match the provider's approved origin.
3. External destinations prohibit direct IP, loopback and private DNS resolutions; request mappings are bounded and restrict properties, data types and output variables.
4. Queued provider jobs store encrypted payload snapshots plus relational connection/operation identity. Dispatch rechecks the current active provider configuration and Flow eligibility before network delivery. Changed or disabled providers fail closed.
5. SMS/WhatsApp permission to contact and sender verification are **not** inferred from a Flow definition. Tenant builders must route through Decisions checking the recipient's verified/opted-in record state before the provider call; providers retain their own compliance checks.
6. Platform password recovery is a protected workflow. Its disabled SMS/WhatsApp options are not unlocked by the general Outbound Message Action.

## Browser acceptance walkthrough

1. Configure a tenant HTTPS Named Credential, then create a provider with a POST operation and active tenant integration connection referencing that credential.
2. In Flow Builder, create an Autolaunched Flow with input variables for recipient, message and request ID; use Decision guards for verified recipient and consent.
3. Choose **Outbound Message**; select the active connection and operation, then use **Message Request Fields** to map the provider's expected JSON field names to Flow resources.
4. For an ordinary **HTTP Callout**, use **Query Parameters** and **Request Body** mapping rows. With synchronous delivery, map scalar response paths into previously declared variables. Durable asynchronous delivery has no immediate response mapping.
5. Use **Get Records** and a Formula resource containing `VLOOKUP("SKU-001", {!Products}, "SKU", "Price")` to look up a value from a bounded collection; preview and debug with test data.
6. Validate, publish, and test with a disposable tenant and provider sandbox; inspect Flow History and the durable outbox for failures and retry status.

## Limits and compatibility

* No arbitrary JavaScript/SQL/JSON editing required for standard request and response mapping workflows.
* Named Credentials remain the only source of outbound secrets; no secret data is returned to browser or debug snapshots.
* Existing plain text body templates still execute through the shared HTTPS transport; the no-code editor creates structured JSON request bodies.
* There is no claim that a configured provider is a native SMS carrier or WhatsApp Business integration. Provider onboarding and destination compliance are separately required.
