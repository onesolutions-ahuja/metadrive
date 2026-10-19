# P0 — Universal no-code application acceptance (KFC reference workload)

This is an application-neutral test workload. The customer owns the KFC logo
and imagery; no KFC behaviour, object schema or route belongs in Core.

## Configuration-first scenario

Using **only the authenticated browser builders** on a disposable tenant:

1. Create an App and reuse the seeded Product object. Create an optional
   MealChoiceGroup Object with Product lookup, MinChoices, MaxChoices and DisplayOrder.
2. Create MealChoiceOption with ChoiceGroup/Product lookups and a numeric Upcharge.
3. Add Product and choice records using Record forms or CSV importer.
4. Configure OneItemGrid to **select** rather than immediately mutate a basket;
   use the shared selection key to open OneOverlay.
5. Configure OneChoice from an Object via Option Label, Record ID and optional
   price Field selectors. Set maximum selection; bind the change event to an
   active, RBAC-authorised Flow.
6. Configure a Get Records Flow and a Record Collection resource, then use
   COLLECTIONCOUNT({!SelectedOptions}) to validate selection count and
   COLLECTIONSUM({!SelectedOptions}, "PriceMinor") to calculate selected prices
   where PriceMinor is a readable numeric field.
7. Use Create Records / Update Records in the same shared Flow runtime to
   persist resulting Order and Order Lines. Repeat all validation on the server.
8. Bind checkout lifecycle outputs by their selected Flow resources.
9. Activate and run the published App using a restricted policy, not developer
   credentials. Confirm isolation from other tenant records.
10. Deactivate/uninstall optional modules and confirm that their runtime
    functionality stops, but tenant business records survive.

## Proven source-code improvements in this branch

- Generic Flow formula collection count/sum, limited to 200 record resources,
  with strict numeric field checks and a unit test.
- OneChoice can project permission-filtered records into visual choices with
  configurable label, identity, price, max/min fields.
- OneItemGrid supports explicit select/action mode without silently adding
  products to the shopping cart; default behaviour remains unchanged.
- OneOverlay can open from a same-page selection event; OneRepeater can
  present records using metadata-selected fields.
- All new instance property contracts are in the published One- descriptors.
- CI metadata tests include the pure choice projection/selection tests.

## Unresolved P0 release gates (do not claim ready)

1. **Kiosk identity:** implement and test a least-privilege, tenant-scoped
   customer/device session and routing contract without exposing staff auth
   or administrative APIs. A marketing/public route is not device auth.
2. **Asset workflow:** browser-upload and select authorised branding/media,
   enforce tenant ownership and safe image types/size, preserve file references,
   and demonstrate the same assets on a published page.
3. **Checkout:** verify idempotent server checkout, server-side price and
   option revalidation, durable order creation, cancellation/failure recovery,
   and safe simulated payment through existing Flows.
4. **Builder previews:** interactive test on isolated disposable data so
   Flow/navigation are verifiable without publishing. Never execute production
   actions merely by turning on preview.
5. **Visual related-record composition:** prove dynamically filtered
   option groups, record-context propagation to nested components,
   basket edit/remove flows, and min/max validation across navigation.
6. **Flow capability parity:** run the actual database migration and verify
   toolbox, editor, validator and executor for Get/Update/Delete Records,
   Subflow, Filter, Sort, Transform and triggered Flow types.
7. **Schema and lifecycle:** verify independent app seeding, SQL idempotency,
   customisation preservation, RBAC and optional-app lazy loading.
8. **No-code usability:** one independent browser operator must perform every
   step with no JSON, JavaScript, SQL, manual URLs or developer console.

## Test commands

- npm run check
- npm run test:system --workspace apps/server
- npm run test:metadata
- npm run build

Then run authenticated browser and PostgreSQL integration tests against a
disposable tenant with independent kiosk/customer and administrative users.
Code review and static checks cannot certify kiosk security, transactional
checkout or pixel-level reference parity.
