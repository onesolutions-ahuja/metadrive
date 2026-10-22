# Ace Assist — standalone booking frontend (proposed)

Ace Assist is a **separately installable, lazy-loaded presentation application**, not a
second platform or business-services backend. Its eventual public route is
`/aceassist`; the MetaDrive host routes users to the appropriate tenant and
uses the existing authentication/session APIs for sign-in and sign-out.

## Ownership boundaries

| Capability | Owner |
| --- | --- |
| Company profile, locations, working hours, services and billing settings | MetaDrive SQL Object Manager / tenant metadata |
| User registration, roles, sessions, RBAC and OneEngine permission set | MetaDrive Core |
| App licences, installation and activation | AppExchange |
| CRUD, relationships, object- and field-level access | MetaDrive Object APIs |
| Appointment/rescheduling/completion, quotations, invoice conversion, pricing/tax and reminders | Shared metadata Flows and Actions |
| WhatsApp/SMS connectors, HTTP callouts, credentials and webhooks | Shared UNE integration/communication engine |
| Calendar, booking form, quotation and invoice presentation | Ace Assist Page Runtime + shared One components |

Never maintain parallel user, company, product, price, tax, invoice, quotation or
booking tables in the frontend. Never instantiate a new permission or Flow
engine in Ace Assist. Avoid importing Page/Flow Builders into runtime bundles.

## Required pages

1. Branded staff sign-in (delegates to MetaDrive auth; tenant/app entitlement checks)
2. Calendar (day, week, month, agenda; resource and location filtering)
3. Create/view/edit appointment and mark visit complete or reschedule via Flows
4. Customer/patient profile (limited by record/field permissions)
5. Self-service booking (limited public permissions and spam protection)
6. Quotations and quotation lines (versioned shared Core Object metadata)
7. Billing: Invoice and InvoiceLine, never a second billing record model

All screen definitions, events, property values and data bindings must be
published as tenant-aware SQL metadata through the standard Page Builder and
published Page Runtime. Default layouts may be installed using a versioned,
non-destructive Ace Assist app seeder, **not** hardcoded into TSX runtime.

## Reuse before extending

Already present: OneCalendar, OneRecordForm, OneTable, OneCard, OneGrid,
OneInput, OneLookup, OneButton, OneMetric, OneTabs, OneRepeater, and OneTimeline.

Extend **OneCalendar** to honour its advertised day/week/month/agenda views,
resource layout, metadata-field mapping, events and drag-to-reschedule only
after appropriate permission/availability checks. Extend **OneRecordForm** to
discover newly created fields from approved Object metadata and to honour
field visibility, type and validation. Its newly visible fields must **never**
override field-level permissions. Use **OneTable** to display quotation
lines initially; if inline line-item editing is needed, implement a reusable
**OneEditableGrid** in the shared `apps/web/src/one/` component registry,
not an Ace Assist-specific renderer. All components must expose properties
for style, layout, dimensions, responsiveness, events and bindings.

## Reusable Core sales metadata

`apps/server/src/app-seeders/core-quotation-objects.ts` provides
`Quotation` and `QuotationLine` definitions on tenant provisioning and
existing-tenant reconciliation. It adds metadata only; no business records.

Use existing `Customer`, `Contact`, `Account`, `Product`, `Invoice` and
`InvoiceLine`. Quotation-to-invoice conversion and all calculations must be
authorable using the shared Flow engine. Do not calculate authoritative money
amounts or derive invoice balances inside frontend components.

## Non-negotiable acceptance checks

- Not installed: app route/modules and app-specific Flows do not load/run.
- Installed and licensed: only users with appropriate tenant permissions enter.
- An Object Manager field added after install becomes available in Ace Assist
  forms through metadata without redeploy, subject to field-level access.
- Shared One component properties from Page Builder drive appearance and
  events; no duplicate Ace Assist variants or hardcoded appointment business logic.
- Quotation/QuotationLine appear in Object Manager for newly provisioned and
  existing tenants after core reconciliation. Existing customisations survive
  reruns. Invoice/InvoiceLine remain unchanged.
- All mutating actions are server-authorised and audited as applicable.
- Tenant isolation, public-booking boundaries, app deactivation/uninstall,
  server-side double-booking prevention, duplicate webhook delivery and timezone
  / daylight-saving transitions are tested.

## Installed tenant seed and login entry

- Public staff route: `/aceassist` — branded independent frontend, shared MetaDrive auth.
- SQL AppExchange ID: `AceAssist`; default published page: `AceAssist_Calendar`.
- Default components: `OneText` title/status and `OneCalendar` empty calendar.
- The default calendar deliberately has no dummy appointments or made-up bookings.
- Permissions: assign `AceAssistUser` with OneEngine. No user assignments are created by seeder.
- App installation reuses the shared `AppRuntime.install` licence/dependency lifecycle.
- SQL metadata seeder: `apps/server/src/app-seeders/aceassist-app.ts`.
- Explicit install after entitlement: `METADRIVE_TARGET_TENANT_SLUG=<slug> node apps/server/dist/scripts/install-aceassist.js` (with standard secured DATABASE_URL).
- Running server never imports app seeder automatically; optional apps are lazy and independent.
- The current `unesolutions-dev` tenant was populated in SQL via an authorised installation.
- A landing calendar is present for permission/routing testing, **not a completed booking workflow**.
  Appointments, confirmations, rescheduling and billing actions still require configured
  Objects, authorised published Flows and live integration testing.

Do not replace customer-customised tenant landing metadata during reinstall.


## Flow-powered operations

The custom Ace Assist frontend now reads and mutates records **only via authorised
Autolaunched Flows**. It does not invoke Object CRUD APIs directly.

For each installed tenant and each existing Object (`Appointment`, `Customer`,
`Quotation`, `QuotationLine`, `Invoice`, `InvoiceLine`), the independent app
seeder adds missing `AceAssistLoad<Object>`, `AceAssistCreate<Object>`,
`AceAssistUpdate<Object>`, and `AceAssistDelete<Object>` Flow metadata.
Existing tenant-authored definitions, versions and business records are preserved.

- Assign the `AceAssistUser` permission set to staff who should perform CRUD.
  The seeder **never** assigns staff automatically.
- **Company Settings → Business Settings:** configure the tenant's organisation
  IANA time zone, seven-day opening/closing windows, and holidays.
  The current tenant had no saved business calendar at implementation time;
  appointment creation/editing therefore fails closed until configured.
- The calendar executes `AceAssistLoadAppointment` (Get Records) and displays
  the resulting appointments within the selected week.
- The server's reusable declarative `businessCalendarGuard` rejects scheduling
  requests outside business hours and on holidays; the custom frontend checks
  the same time window for immediate guidance.
- Lookup choices for linked Customers, Quotations and Invoices are loaded via
  their authorised Get Records Flows. No placeholder/dummy records are inserted.

**Limitations requiring real tenant validation:** Multiple-staff double-booking
conflict handling, appointment notification/reminder Flows, quotation→invoice
conversion, payment collection and financial posting remain separate tenant
workflows. These are not simulated in the frontend.
