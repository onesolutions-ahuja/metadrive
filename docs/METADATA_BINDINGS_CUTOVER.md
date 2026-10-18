# Metadata binding cutover

Object, Field and Flow pickers store stable metadata references when the SQL registry supplies an ID. Existing API-name bindings remain readable for compatibility; unknown IDs stay invalid rather than selecting another object. Names are resolved from tenant metadata immediately before the existing permission-checked APIs are called.

## Database prerequisite

Apply `apps/server/src/system-files/migrations/001-metadata-bindings.sql` before starting the updated server. The fresh schema includes the same additive definitions. No customer records or existing properties are deleted. Startup schema verification refuses to proceed without the two new tables.

App installation accepts an optional `pageSeed` through `POST /api/apps/:apiName/install`, subject to AppExchange management and Page creation permissions and an active app entitlement. `app-seeders/conversation.ts` builds an independent package from selected dependency IDs, direction values and Flow input mappings. It does not invent object schemas, create communication providers or grant access. Register and select the shared component dependency before installation.

The seeder writes typed relational property rows and same-tenant foreign keys. It records its version, adds missing defaults on upgrade and preserves existing values. Removing an app blocks its seeded pages and clears its home assignments, preserving its metadata and business records. Reinstalling reuses its saved properties.

## Conversation configuration

Select the conversation source and map direction, account, sender, recipient, timestamp and body fields. Configure incoming/outgoing values, optional presentation fields, server permission endpoint, and send/assignment Flow bindings. Apply channel/type filters using ordinary record-filter metadata rather than filtering for a specific provider in component code. The permission endpoint must enforce tenant and OneEngine permissions server-side; browser mappings never grant access. No replacement permission endpoint is created by this change.

The old `ChatterInbox` registration uses the same OneConversation renderer. The obsolete frontend page preset and duplicate renderer are removed. Existing SQL pages are preserved; migrating those pages and registered compiled components requires inspection of their actual installed versions and mappings before applying the update.

## Cart configuration

Select item name, price, optional image/search/tax/restriction fields and a valid currency. Configure an explicit tax rate or a working company-setting source. Positive tax rates require a tax-applicability field. Missing financial configuration blocks checkout.

Configure checkout status, request, message and change output names. Map `$event.requestId` into a Flow input and echo it into the selected request output. The shared lifecycle values are `pending`, `complete`, `failed`, and `cancelled`; the Flow supplies the displayed message and change in minor units. A Flow End node publishes only properties explicitly named `output.<name>`; internal variables are not automatically returned. Age checks, payment decisions, restricted-item removal and retry rules belong in Flows. The cart does not interpret business outcomes or automatically remove items/retry checkout.

## Validation boundary

Run `npm run check`. For an actual PostgreSQL integration run, set `METADRIVE_TEST_DATABASE_URL` and run `node --import tsx scripts/verify-metadata-bindings-sql.mjs`; its disposable schema and all test writes are rolled back. Tests exercise renamed IDs, missing bindings, arbitrary conversation schemas, channel filtering, missing currency, rejected checkout preservation, request correlation and explicit Flow outputs. Before rollout, apply the migration on a restored SQL database, upgrade the registered component sources and inspect installed page/Flow bindings. Verify sending, assignment, tax, age checks and payment with the tenant's actual configuration. Source tests do not establish production readiness or measured page latency.
