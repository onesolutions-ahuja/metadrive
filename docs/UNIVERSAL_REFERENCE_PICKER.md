# MetaDrive universal @ reference picker

## Intent
Salesforce-style resource selection with `@` as the entry point. One lightweight browser is reused in Flow Builder and existing Smart Field property editors, including Page/Component/Dashboard/formula-capable fields. Labels come from tenant Object metadata; stored references keep canonical API names.

## Source of truth
- Objects, Fields and Lookup/Master-Detail relationships: tenant SQL Object Manager metadata already loaded through the existing secured setup APIs.
- Flow records: Start trigger, input resources, prior Get/Create Records steps and current Loop items, only where every route to the destination passes the source.
- Screen Flow outputs: typed fields from previously completed Screen elements; no extra hand-written Record resource.
- Related fields in Page/component mentions are offered only through declared forward relationships. A sibling Object being installed or in the same app does not fabricate a relationship.
- The `Id` record field is intrinsic to records and is shown even if absent from custom Object fields.

## UI and stored syntax
- Typing `@` or pressing the @ button opens one searchable resource/field browser with breadcrumb navigation.
- `@Sale` searches the Sale Object by label and API name. A current-record context is required before inserting a field. If the Flow has no Sale record resource, add Get Records or an input resource; do not invent record values.
- Once a resource is chosen, its registered fields are shown with labels, canonical names and datatypes. Declared forward relationships can be navigated on Page/component bindings.
- Flow values remain `{!CurrentOrderLine.ProductId}` after selection; Page/component bindings remain `@Sale.Customer.Name`. Existing published metadata syntax and runtime continue to work.
- Incompatible fields are visible but cannot be selected. Fields not included in explicit Get Records **Fields to Store** show an explanation and cannot be selected until stored.
- Valid Page mentions are blue, invalid mentions plain text. Valid Flow resource bindings are blue; invalid full Flow references fail Flow Check.
- The picker is metadata presentation, **not** authorization. Record/Object/Field RBAC, tenancy and activation remain enforced on the server during execution and fetch.

## Relationship semantics and runtime safety
- A Loop item has the Object type of its collection (or the upstream Get Records query), not a manually named resource.
- A lookup field such as `ProductId` supplies a typed ID; mapping it to another lookup requires matching target Object metadata.
- A lookup ID does not automatically hydrate a related record in Flow execution. To use related Product fields, configure Get Records by that Product ID. No implicit cross-tenant queries or first-record fallback.
- Page/component mention relationships load only by explicit related IDs through the RBAC-checked record endpoint.
- Screen inputs are present only on paths that pass through the Screen. Unavailable, type-incompatible and non-stored references must fail closed.

## Verification and rollout
- Tests: @Sale intrinsic Id and declared relations; data-context binding; typed Screen output; Loop ProductId; missing Get Records stored fields; wrong relationship type; branch skip; existing builder and published runtime.
- Enforce developer policy, TypeScript, server/unit tests, lazy isolation and browser CI. Merge only when all required checks pass.
- Verify Railway commit after merge and confirm no regression on a tenant's actual SQL metadata. Do not activate the POS cash checkout Flow until payment, age verification, inventory, idempotency, permissions and full E2E tests pass.

## Scope boundary
This feature unifies the @ UI used by existing supported property editors and Flow value editors. It does not add implicit Flow relationship dereferencing, create a new CRUD engine, or change tenant metadata automatically. Editors that still use raw text inputs must adopt the shared browser before claiming universal coverage.
