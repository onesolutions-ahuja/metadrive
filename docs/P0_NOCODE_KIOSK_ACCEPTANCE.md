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

## P0 implemented shared-platform capabilities

- Record Collection formulas `COLLECTIONCOUNT` and `COLLECTIONSUM` in the shared
  Flow runtime, with bounded numeric validation and automated tests.
- SQL-backed Flow capability catalogue and builder gating, with validated
  Get/Update/Delete Records, collections, Transform and Subflow paths.
- Configurable ItemGrid selection mode, record-backed bounded Choice,
  related-record filtering, Repeater and selection-driven Overlay.
- Tenant-owned protected image assets, Image property picker and published-page
  media references.
- Tenant/actor/Flow/request-ID execution deduplication and recovery, now storing
  completed responses in relational property-path/value rows rather than JSONB.
- Kiosk basket reset on completion and configurable inactivity; sticky/fixed
  positioning and responsive layout metadata.
- Safe published-app test from Page Builder; no unauthorised production
  mutation inside preview.
- Browser/SQL smoke checks for a restricted kiosk operator, asset access and
  duplicate execution; OneEngine permission enforcement remains server-side.

## P0 release evidence required

1. `npm run check` and `npm run build` must pass for the **final commit**.
2. PostgreSQL schema migrations must pass both fresh-tenant and upgrade paths,
   including the replay-row migration `20261116` and no lost responses.
3. SQL System Validation must pass RBAC, tenant isolation and browser smoke.
4. Frontend visual contract must pass and optional component runtime must
   remain lazy loaded.
5. PR code must be reviewed and merged to `main` without bypassing branch policy.
6. The separately authored browser-only acceptance task must then be executed
   independently in a disposable tenant. See
   `docs/COPILOT_KIOSK_BROWSER_ONLY_TASK.md`.

## Not included in shared-platform P0 certification

- Exact KFC pixel-level design and completed client journey: those require the
  independent browser reconstruction, licensed assets and screen comparison.
- An anonymous/unattended public-device pairing workflow: the P0 demo supports
  a **restricted authenticated operator**. A production public kiosk must have
  explicit device policy, session isolation and physical browser lockdown.
- Real payment-provider approval and physical receipt hardware certification.

## Test commands

```sh
npm run check
npm run test:system --workspace apps/server
npm run test:metadata
npm run build
```

Run the GitHub SQL System Validation workflow (real PostgreSQL, RBAC, migration
rehearsal and Playwright smoke) and independently execute the no-code browser
operator task. **Green static/CI tests prove the tested shared platform scope,
not 100% customer visual parity.**
