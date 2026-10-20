# Copilot acceptance task — build the KFC kiosk with MetaDrive browser builders only

## Goal and reference
Independently create a faithful KFC kiosk demo in a disposable MetaDrive tenant,
using **only the MetaDrive browser UI**. The sole visual reference is:
https://flyingbisons.com/projects/kfc-refreshing-the-food-ordering-kiosk-s-interface

Use only client-authorised KFC marks and food photography. Do not reuse older kiosk
requirements. This is a **no-code operator acceptance test** of the shared MetaDrive
platform, not permission to write a KFC-specific Core implementation.

## Strict operating rules
- No source changes, JavaScript, SQL, JSON, external developer tools, manually
  constructed API requests or browser developer console.
- Start with a new tenant or isolated disposable demo tenant, a restrictive
  **tenant operator** RBAC assignment, and only the required application permissions.
  Tenant developers configure metadata but the published kiosk is tested as a
  separate restricted user. No anonymous identity bypass or shared staff credentials.
- Reuse existing Product, cart/order metadata, Components, Flow handlers and
  application services where appropriate. Inspect before creating any new Object
  or capability. New items belong to the tenant app's metadata, not shared Core.
- If a browser control is absent, report its exact screen, attempted property,
  expected behaviour, actual behaviour, screenshot and severity. Do not simulate
  success by inserting seed data through a script.
- Demo checkout can be simulated using a published Flow. Do not charge cards or
  claim a real payment provider is certified.

## 1. Schema — use Object Manager
First inspect standard Product and any existing order/cart objects; **extend, don't
duplicate**. Reuse their API names when suitable. Suggested **tenant-configurable**
records and fields:

| Object / relationship | Fields and use |
| --- | --- |
| Product (existing) | Name, SKU, Price, Active, ImageUrl; optional Category lookup and ProductType picklist (Single / Meal) |
| MenuCategory | Name, DisplayOrder, ParentCategory lookup, Image/Icon |
| MealChoiceGroup | Parent Product lookup, Name, MinChoices, MaxChoices, IncludedQuantity, DisplayOrder, Active |
| MealChoiceOption | Group lookup, Choice Product lookup, AdditionalPrice, Active, DisplayOrder |
| CartSession | SessionKey, Status, ServiceMode, ExpiresAt |
| CartLine | Session lookup, Product lookup, Quantity, PriceMinor, Status |
| CartLineSelection | CartLine lookup, Group lookup, Choice Product lookup, Quantity, AdditionalPriceMinor |
| Order / OrderLine | Reuse available objects; record snapshot of product, options, quantities, prices, tax and service mode |
| CheckoutRequest | Optional app-level reference to the server-provided request UUID; never use it as an authorisation token |

Use **Lookup/Master-Detail** for relationships, Currency/Number for prices,
Number for min/max/quantity, Picklist for states and mode, DateTime for expiry.
Preserve customer data during activation, uninstall and app upgrades. Generic
Objects and Fields can represent bucket meals; **do not ask for a custom bundle
engine**.

Example: Family Bucket is a Product record; related MealChoiceGroups specify
'Chicken = choose 4', 'Sides = choose 2', 'Drinks = choose 2'. MealChoiceOption
records list eligible products and upgrade charges. Another meal is new records.

## 2. Data and branding — browser only
- Upload the authorised logo and menu imagery with the shared tenant asset picker.
- Link uploaded media to Product and page Image components; verify rendering in a
  published page as the restricted user and absence of cross-tenant media access.
- Enter demo categories, simple products, meal Products, choices and sample prices
  through Record forms or the browser's supported CSV workflow.
- Set active flags and exact ordering in data; do not hardcode categories in Core.

## 3. Pages and components
Build and publish, using shared Page Builder and Component Properties:
1. Welcome / branded start, with KFC logo and accessible touch target.
2. Eat-in / takeaway choice (if included in the approved user journey).
3. Product browse with category navigation, promotional content and ItemGrid.
4. Product details and modifiers; use ItemGrid **select** behaviour and shared
   selection key to open OneOverlay, rather than prematurely adding to basket.
5. Meal choice groups using object-bound OneChoice and Repeater. Enforce
   selections in a server Flow, not solely by disabled buttons.
6. Basket with quantity changes, edit/remove, amounts and clear session.
7. Checkout simulation / confirmation / new order.

Configure responsive portrait dimensions and sticky positioning through
metadata properties. Use the published-app test shortcut; a read-only Builder
preview is *not* authority to execute production mutations.

## 4. Flows — visual Flow Builder only
Create and activate appropriately permissioned, app-owned Flows:
- StartSession (new session, service choice);
- LoadMenu and LoadMealChoiceGroups (Get Records, lookup relationships, filters);
- ValidateMealChoices (Collection Filter, Get Records, Decision, Assignment);
- AddConfiguredItem, EditBasketItem, RemoveBasketItem;
- Checkout (re-query Product and option records, recompute authoritative totals,
  validate quantities, taxes and prices, Create Records, return typed outputs);
- Cancel/Failure/ResetSession.

For Record Collections use:
- `COLLECTIONCOUNT({!SelectedOptions})` for selection counts;
- `COLLECTIONSUM({!SelectedOptions}, "PriceMinor")` on a readable numeric field;
- Flow Decisions to compare counts against each group's MinChoices/MaxChoices.

Never trust a component's presented price as the authoritative server charge.
Configure completion status and checkout request ID outputs explicitly. Generate
a **unique UUID per new checkout request**; retries of the *same* request must
not duplicate an order. Failed requests require an explicit new request ID.

## 5. Runtime/security acceptance
Test **as a restricted tenant operator** in a published app. Validate:
- product/meal selection, price upgrades, basket edit/remove, checkout success;
- exact/min/max choice failure messages and recovery;
- inactive Flow, inactive app, insufficient Object/Field permission denial;
- duplicate request ID, changed payload with same ID, cancelled payment, expired session;
- tenant media isolation and no access to other tenants' records;
- app deactivation and install/uninstall preservation of business records;
- no optional kiosk module loading for Core-only tenants.

No production kiosk should run on developer credentials. A long-lived unattended
public kiosk requires a separately approved device pairing/session security model
and physical kiosk management; **do not fake anonymous access**.

## 6. Evidence and sign-off
Capture screen recordings/screenshots at the client's target portrait resolution
for each referenced screen and each success/failure route. Produce a comparison
table: reference screen, recreated screen, interactions, exact remaining
visual/function gap, blocked property/Flow, screenshot.

Acceptance is **not** achieved by opening the browser or submitting API data.
The full operator journey must be configured and exercised from actual controls,
without code. Report Done / Pending / Blocker against this checklist, and state
which Flows/Objects could not be built by a nondeveloper.

## Scope boundary
The shared-platform P0 implementation and SQL CI are separate from the client
demo's final 100% design/interaction sign-off. Do not claim complete visual
parity without approved reference captures and independent manual comparison.
