# Acetill — MetaDrive transaction terminal

Acetill is an optional independently licensed/installed POS-facing application, not a new core engine.

**Core-owned:** login/session, tenant isolation, central OneEngine permission evaluation, shared SQL Product/Customer/Cart/Order data, One component registry/renderer, Page Runtime, Action/Flow engine, printing integrations and management screens.

**Acetill-owned:** package identity, branding, register/sale/checkout/receipt page metadata and POS workflow configuration. Manage product catalogues, stock, reports, customers and locations in UNE Solutions.

## Status
The published v2 package supplies editable Register, New Sale, Checkout and Receipt pages
and sets Register as the app's initial Home Page. It does **not** install or license Acetill
for a tenant, seed business records, process a payment, or create a login fork.
Payment-provider integrations and transaction-safe checkout are not bundled.

## Installation path
Register the versioned SQL metadata through authorised publisher tooling. The installer
verifies required shared Objects, Product fields and One renderer Components before
materialising tenant-scoped pages/navigation. It assigns the package-declared Home Page only
when the tenant has not already assigned one. Install Acetill from AppExchange after the
package release is deployed. No tenant business-data seed and no dummy products.

The package binds existing Product data through One components. Checkout and receipt actions
call `AcetillCompleteSale` and `AcetillPrintReceipt` only when those tenant Flows are active
and the user has central `Flow:<apiName>:execute` permission. The checkout Flow must be an
Autolaunched Flow, validate the request and perform atomic order/payment/stock work; it must
return the request ID and a verified status (`pending`, `complete`, `failed`, or `cancelled`)
before Acetill displays success. A missing, inactive or unauthorized Flow cannot transact.
No app-specific API/auth/database.

Package resource declarations are install-time dependency checks, not permission grants.
They make sure the shared Object fields and Components a page references exist. Runtime
Object/Field access and Flow execution are still decided by central RBAC. Standalone
Autolaunched actions use the Flow name and declared type from page metadata, then let the
server enforce active status, tenant/app entitlement and Flow execution permission; they do
not require the app user to have Flow Definition read access.

## Acceptance
- Core works without Acetill.
- Uninstalled/unlicensed Acetill never loads or processes transactions.
- Tenant RBAC gates all action/record/field access server-side.
- Page and component metadata remains editable in existing Builders, published state stored in SQL.
- Install, upgrade, deactivate and reinstall preserve customer data and customisations.
- Payments never report success until recorded transaction completion is verified.

## UI-only handoff to Flow Builder

The SQL package declares four editable Acetill pages and reuses OneText, OneBadge,
OneSearch, OneItemGrid, OneShoppingCart and OneButton. Sale components reference Product.Name,
Product.Price and Product.Active, and share the same `acetill` cart target.

**Flow authoring is owned by the UNE Solutions administrator.** `AcetillCompleteSale` accepts
the `checkoutRequest` event payload and must return `status`, `requestId`, `message`,
`changeDueMinor`, and `orderId`. `AcetillPrintReceipt` accepts the confirmed `orderId` from
page state. Keep these as active, validated Autolaunched Flows and grant execution through
central RBAC only to authorised users. No Flow is silently created or granted by this package.

The page buttons remain available; an absent/inactive Flow fails closed in the shared runtime
and the server independently enforces active Flow and RBAC checks. Validate tenant financial
settings, Product VAT metadata and checkout/receipt Flows before processing real transactions.

The intended public route is `https://unesolutions.co.uk/acetill`. The same hosted SPA and
MetaDrive authentication handle it; domain hosting/deployment must be verified separately.


## Cash and card settlement Flows (v1)
`flows/payment-flows.v1.json` is the versioned metadata source for the independently installed
`AcetillPaymentCash` and `AcetillPaymentCard` Autolaunched Flows. Run
`node apps/acetill/scripts/seed-payment-flows.mjs --tenant=<slug>` with an authorised
backend `DATABASE_URL` to create draft definitions only. Existing tenant Flows and
customisations are preserved; publishing/activation requires validation.

Both Flows accept `cartItems` as an **OrderLine Record Collection** with
`Product` and `Quantity` fields plus `requestId`. They fetch active Product records
and authoritative Price values on the backend, reject invalid items/quantities or
insufficient/unconfirmed tender, create an Order and its OrderLines, verify the saved
line total matches the Order total, and return `status=completed`, `orderId` and `total`.
Cash additionally takes `cashReceived` and calculates server-side change; Card
requires `cardPaymentConfirmed=true`. Flows use the existing user OneEngine context,
Acetill app entitlement, and backend record permissions. They do not implement a card
processor integration; operator confirmation remains a human attestation.

These Flows do not define tax calculation, discounts, inventory deduction, refunds or
acquirer settlement. Add such rules as independently configured Flows before relying on
those business capabilities. There is no direct SQL access from the Acetill frontend.
