# AceKiosk

Independent touchscreen UI at /acekiosk, using the existing MetaDrive /login session, tenant-aware Product and MenuCategory records, central OneEngine authorization, and the active authorised AceKioskCheckout Flow.

This frontend deliberately contains **no sample products, hardcoded totals used for checkout, business-data SQL or separate authentication**. Product images, names, categories and prices come from tenant records. ImageUrl/PhotoUrl must be valid permitted image URLs configured by the tenant. Category and products access follows Object/Field/Record permissions from the shared API.

## Admin setup
Install/activate AceKiosk through AppExchange lifecycle before enabling production; tenant routing still requires install/licensing enforcement in the shared runtime. Ensure Product and optionally MenuCategory objects exist and are permitted. Configure the AceKioskCheckout autolaunched Flow to accept cartItems, perform authenticated tenant-scoped authoritative repricing, inventory, tax and payment processing and return {status:'complete',orderId} **only after committed confirmation**. The frontend cannot simulate payment confirmation.

## Acceptance still pending
Route deployment, full AppExchange package registration, explicit installer seeding, product image parity, customisation/bundle flows, QA/browser tests and payment integration. This initial frontend is not a claim of KFC parity or production readiness. KFC logos/artwork are not included; commercial rights must be secured.
