# Acetill — MetaDrive transaction terminal

Acetill is an optional independently licensed/installed POS-facing application, not a new core engine.

**Core-owned:** login/session, tenant isolation, central OneEngine permission evaluation, shared SQL Product/Customer/Cart/Order data, One component registry/renderer, Page Runtime, Action/Flow engine, printing integrations and management screens.

**Acetill-owned:** package identity, branding, register/sale/checkout/receipt page metadata and POS workflow configuration. Manage product catalogues, stock, reports, customers and locations in UNE Solutions.

## Status
This workspace establishes the package and tested access/navigation contract. It does **not** activate a tenant, process a payment, or create a login fork. Neither payment-provider integrations nor transaction-safe checkout are claimed ready.

## Installation path
Publish versioned SQL metadata via the existing central AppExchange package publisher, after verifying each required Object/Field and renderer Component exists. Use the existing package tables (md_app_package_versions, md_app_package_page_templates, md_app_package_navigation, etc.), SQL-only tenant-scoped metadata, and the central installer. Register actual published page components and flows through that publisher. No tenant business-data seed and no dummy products.

For the sale screen, bind existing Product data through One components, and call a published central RBAC-checked checkout Flow. Atomic order, payment, stock and receipt handling need integration testing before enabling real checkout. No app-specific API/auth/database.

## Acceptance
- Core works without Acetill.
- Uninstalled/unlicensed Acetill never loads or processes transactions.
- Tenant RBAC gates all action/record/field access server-side.
- Page and component metadata remains editable in existing Builders, published state stored in SQL.
- Install, upgrade, deactivate and reinstall preserve customer data and customisations.
- Payments never report success until recorded transaction completion is verified.
