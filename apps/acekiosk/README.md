# AceKiosk

Independent touchscreen UI at /acekiosk, using the existing MetaDrive /login session, tenant-scoped Product and MenuCategory records accessed through an authorised AceKioskLoadMenu Flow, central OneEngine authorization, and the active authorised AceKioskCheckout Flow.

This frontend deliberately contains **no sample products, hardcoded totals used for checkout, business-data SQL or separate authentication**. Product images, names, categories and prices must come from tenant records via the configured AceKioskLoadMenu Flow. The Flow returns {products: [], categories: [], optionsByProduct: {}}. Optional optionsByProduct keys are Product IDs; values are arrays of {id,label,required,choices:[{id,label,description}]}, with server-side field permissions, filtering and ordering enforced. ImageUrl/PhotoUrl must be valid permitted image URLs configured by the tenant. Category and products access follows Object/Field/Record permissions from the shared API.

## Login, landing and permissions

- MetaDrive user creation owns the `landing_app_api='AceKiosk'` assignment.
- The shared MetaDrive login and session redirect to `/acekiosk`; no kiosk login database.
- MetaDrive's `/metadata/apps/AceKiosk/access` gate is the single installation,
  entitlement, activation and OneEngine permission check, before the frontend loads.
- The tenant's AppExchange installation and `AceKioskUser` permission set are SQL
  metadata managed by MetaDrive; permission-set assignment is separate from landing.
- **No Page Builder Home Page or `md_app_home_pages` row is required.** The custom
  AceKiosk React frontend owns presentation only; business data comes from Flows.
- A static GitHub Pages redirect at `/acekiosk/` supports the standalone URL;
  it stores no tenant information and grants no permissions.

## Admin setup
Install/activate AceKiosk through AppExchange lifecycle before enabling production; tenant routing still requires install/licensing enforcement in the shared runtime. Ensure Product and optionally MenuCategory objects exist and are permitted. Configure and activate AceKioskLoadMenu to Get Records, apply active-item filters and ordering and return products and categories. Configure the AceKioskCheckout autolaunched Flow to accept cartItems, perform authenticated tenant-scoped authoritative repricing, inventory, tax and payment processing and return {status:'complete',orderId} **only after committed confirmation**. The frontend cannot simulate payment confirmation.

## Acceptance still pending
Route deployment, verified tenant AppExchange installation, explicit installer seeding, product image parity, verified modifier and bundle mapping, QA/browser tests and payment integration. This initial frontend is not a claim of KFC parity or production readiness. The standalone screen uses neutral kiosk branding rather than third-party demo trademarks. Tenant branding remains a separate metadata-driven configuration requirement.
