# KFC kiosk reference — browser-only acceptance task for Copilot

## Mission

Recreate the agreed KFC self-service ordering journey in MetaDrive **entirely from a browser**, using the Flying Bisons reference:
https://flyingbisons.com/projects/kfc-refreshing-the-food-ordering-kiosk-s-interface

The target is threefold: the approved visual design, functional order processing, and reproducibility by a non-developer. Source-code changes, SQL, JavaScript, JSON editing, developer tools, cURL, Postman and direct API calls are **forbidden in this acceptance run**. Do not build a special KFC runtime, hardcode a meal builder or bypass RBAC. Do not assume that a backend capability works just because it is listed in documentation.

Use KFC brand assets, prices, promotions and photography only when approved/provided for this demo. Clearly label invented menu/prices as test data. A simulated payment must be clearly identified as simulation.

## Preconditions — engineering must demonstrate these before browser acceptance

- Tested mainline build is deployed with all required migrations, component registrations and active Flow capabilities; the tenant has App Manager, Object Manager, Page Builder, Flow Builder, Record Workspace, AppExchange and OneEngine permissions.
- Supported public or device-scoped kiosk launch is available. Never share tenant developer credentials with kiosk customers or grant administrative permissions to the kiosk.
- The reference screenshots, target kiosk viewport dimensions and approved logo/assets are available.
- The tenant is disposable or has a dedicated demo dataset, and any payment action is simulated or uses an authorised sandbox credential.
- Builder metadata persists to SQL and passes permission checks. App install and activation are independent of possession of OneEngine permissions.
- Execute under a normal delegated app-builder account, not a platform superuser. Staff-facing builder and customer-facing kiosk identities must differ.

If any precondition fails, record the exact UI page, field/action and observed error; do not quietly substitute direct API/configuration work.

## Browser build journey (execute in this order)

1. **Application**: In App Manager create `KFC Demo`, link its pages and its reusable data objects. Confirm independence from optional ONEpos apps.
2. **Branding**: Upload/select the approved KFC logo, product photography and colour/typography settings using the available UI. Verify the logo on every required screen. Report lack of an upload/picker as a platform gap, rather than uploading assets using a shell.
3. **Object reuse**: Inspect the existing Product, Order, Order Line and category/cart definitions before creating new Objects. Never duplicate a viable existing standard or shared Object.
4. **Meal metadata**: Where not already present, configure a meal through related Objects, not through special code:
   - Product: meal type, name, image, base price, availability, tax classification.
   - ChoiceGroup: parent Product lookup; name, display order, minimum, maximum, included count and required flag.
   - ChoiceOption: group lookup, selectable Product lookup, availability, price adjustment and display order.
   - CartLine / CartSelection: cart/session and chosen product/option identity, quantity and appropriate monetary fields.
   - Order / OrderLine: durable final records and selected modifiers using existing objects wherever possible.
   Use Currency, Number, Checkbox, Picklist, Formula, Lookup and Master-Detail Field types appropriately. Record how ownership and permissions are configured.
5. **Seed sample data from browser**: Add several distinct meal, chicken, side and drink Products. Create one meal with two different groups and different min/max rules. Use forms or the supported CSV import. Verify matching record values through Record Workspace.
6. **Flow resources**: Configure a flow accepting an input-enabled Record Collection of chosen IDs, the selected Product, session ID and any required object identities. Expose typed outputs for success, failure, messages and request correlation. No manually entered JSON.
7. **Validation Flow**: Re-query the selected Products/Options with the shared permission-checked Get Records capability. Check availability, group membership, selection count, bounds and total numeric adjustments; use `COLLECTION_COUNT` and `COLLECTION_SUM` only for validated server-loaded records, not client-provided prices. Use visual Decision, Loop, Assignment, Create/Update Records and error paths.
8. **Menu page**: Build the approved portrait kiosk layout with generic OneContainer, OneGrid, OneNavigation, OneImage, OneItemGrid, OneText and OneButton components. Configure vertical category navigation and rich product cards. Use responsive metadata, not custom CSS/JS.
9. **Selected-product context**: Set ItemGrid `itemSelectMode=action`, then bind `itemSelect` to a SetFilter event, using the selected Product ID and shared key `selectedProduct`. **Do not use the legacy default `cart` mode**, as it adds the product before customisation. Alternatively select `itemSelectMode=filter` and set `itemSelectionFilterKey=selectedProduct` if no additional Flow action is needed. Configure sibling components' matching Object field with `sharedFilterKey`, `sharedFilterFieldApiName`, `sharedFilterValueSource=recordId` and `sharedFilterRequired=true`. In OneOverlay set `openOnSelectionKey=selectedProduct` and place the product/detail and options components inside. Confirm changing the product changes related choice records without leaking unrelated choices.
10. **Personalisation**: Configure OneChoice using `optionSource=records`, a bound Object, `optionLabelFieldApiName`, optional availability/price fields and min/max selection settings. Bind `selectionChanged` to a Screen/Autolaunched Flow with `$event.records` mapped into an input-enabled Record Collection. The event conveys only selected IDs: backend Flows must re-read prices, availability and group membership.
11. **Customer journey**: Build product details, required and optional choices, basket review, edit/quantity/remove, optional upsells, service mode, checkout, payment simulation and completion/restart. Use shared components and Flows. Do not treat the existing till component as a complete kiosk by changing its colour only.
12. **Checkout**: Verify currency, tax applicability, amounts in minor units where applicable, lifecycle outputs, request ID correlation, transaction creation and durable order lines. Include retry, fault and cancelled states. Prevent duplicate submissions; the client must not be the authority for price or stock.
13. **Kiosk launch**: Publish Pages and activate Flows using browser controls; assign only effective device/guest permissions. Open the kiosk through a supported customer-facing URL. Check no staff login or app administration is exposed.
14. **Interaction checks**: Touch through each journey in at least one agreed portrait viewport. Verify back, cancel, restart, empty state, invalid selection, unavailable product, offer skip, duplicate clicks, failed payment, successful confirmation and fresh-session isolation.
15. **Client parity**: Capture all agreed reference-equivalent screens. Compare logo placement, typography, card layout, category navigation, images, modals, basket position, touch zones and transitions. Give exact screenshot-diff findings rather than claiming approximate parity is 100%.

## Example acceptance scenario

Test-only Family Bucket: include four chicken choices, choose two side options and two drinks. Attempt to exceed a maximum, leave a required group empty, change an option, and select an unavailable one. Each invalid action must be rejected; the basket and order totals must reflect the authoritative Flow-calculated values. Verify records persist only within the correct tenant and the kiosk can restart without retaining the prior customer's selections.

## Mandatory blocker report format

For each blocker provide: **Stage, browser URL/screen, role, exact clicks, component/Object/Field/Flow names, expected behaviour, actual behaviour/error, severity (P0/P1/P2), screenshot, and whether existing metadata can resolve it**. Do not mark a feature missing before checking Object Manager, Field Wizard, Component Properties, Page Builder, Flow Builder and their available metadata mappings.

Classify:
- `Configuration` — existing generic capability is usable through the UI.
- `Editor gap` — backend/runtime supports it but visual controls are inaccessible/incomplete.
- `Runtime gap` — generic shared behaviour genuinely missing.
- `Permission / installation` — RBAC, entitlement or app activation issue.
- `External` — approved KFC assets, payment sandbox/provider or deployment access needed.

## Evidence and sign-off

Provide (1) screen-by-screen screenshots, (2) created/extended Objects and fields, (3) active Flows and their input/output contracts, (4) installed/activated package and navigation, (5) tenant-safe end-to-end order records, (6) browser interaction recordings or repeatable click paths, and (7) a complete pass/fail table with exact remaining blockers.

A test that succeeds only with code, SQL, admin bypasses, browser dev tools or unapproved client assets **fails** no-code parity. 100% parity is a *release acceptance result*, not a developer promise.
