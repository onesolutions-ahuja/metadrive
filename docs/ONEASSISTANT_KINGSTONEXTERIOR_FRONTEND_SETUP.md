# OneAssistant — Kingston Exterior Frontend Setup & Free-Trial Checklist

**Status:** Manual pilot setup instructions. Do not mark tenant, RBAC, app installation, or trial as complete until each is verified in the live frontend.  
**Prepared:** 16 October 2026  
**Business:** Kingston Exterior / `kingstonexterior.co.uk`  
**Reference:** [OneAssistant PR #540](https://github.com/onesolutions-ahuja/metadrive/pull/540)  
**Policy:** [MetaDrive Developer Policy](../DEVELOPER_POLICY.md): One Core, OneEngine RBAC, SQL metadata, tenant isolation, one AppExchange lifecycle, reusable components and Flows.

> **Release readiness / stop point:** On the reviewed `main` branch, OneAssistant is **not** yet in the installable-package catalogue; its package is on PR #540. The OneAssistant discovery record is also **absent from `apps/server/data/connector-apps.json`**, including the PR branch. The optional initial-admin Developer-policy checkbox is part of PR #540 and is **not on deployed main** until merged/deployed. You can carry out authorised tenant provisioning using existing frontend features, but **do not attempt the OneAssistant app install/trial until OneAssistant is visible in AppExchange following verified release and catalogue registration.** Do not create a placeholder connector to bypass that step.

## 0 — Pilot identity and scope

| Property | Required value |
|---|---|
| Tenant ID | `kingstonexterior` |
| Tenant name | `Kingston Exterior` |
| Administrator display name | `Kingston Exterior Admin` (or owner-approved name) |
| Initial administrator email | `tanha.ahuja2@gmail.com` |
| Initial profile | `System Administrator` |
| Additional grant | `OneEngine Tenant Developer` / `oneengine-tenant-developer` |
| Developer domain field | `kingstonexterior.co.uk` |
| Separate developer account | `developer@kingstonexterior.co.uk`, **disabled on creation** |
| Tenant time zone | `Europe/London` |
| App package key | `one-assistant` |
| App API name | `OneAssistantApp` |
| App entitlement | One-time **free trial only**; **do not grant a paid licence** |

The initial administrator and `developer@kingstonexterior.co.uk` are **different accounts**. The administrator is explicitly assigned a **tenant-scoped** Developer permission set. The separate developer user remains disabled until tenant activation. Neither identity receives `platform:superadmin` or `licence:manage` via tenant RBAC. App entitlement is separate from both identities.

## 1 — Preflight in the frontend

- [ ] Open the trusted deployed frontend; the existing branded login is at `https://unesolutions.co.uk/login`. Sign in as a **Platform Administrator** whose effective permissions include `platform:superadmin`.
- [ ] Navigate to **Setup → Tenant Management**, relative route `/une/setup/tenant-management`.
- [ ] Confirm the **New tenant** button is visible. If this requires platform administration, **do not** try to assign platform privilege in tenant RBAC.
- [ ] Search for tenant ID `kingstonexterior`. If it already exists, open its details and **do not** create another tenant.
- [ ] Check what release is currently deployed. A checkbox present only on PR #540 is **not** a live UI capability.
- [ ] Have a strong **unique initial password** ready to type directly into the secure HTTPS form (12+ characters). Never place passwords, sessions, API keys, reset tokens, or customer secrets into GitHub docs, chat, screenshots or seeders.

## 2 — Create the tenant

1. In **Setup → Tenant Management**, choose **New tenant**.
2. Enter:
   - **Tenant ID:** `kingstonexterior`
   - **Organisation name:** `Kingston Exterior`
   - **Initial administrator name:** `Kingston Exterior Admin` (unless the owner specifies a different display name)
   - **Initial administrator email:** `tanha.ahuja2@gmail.com`
   - **Initial administrator password:** set securely in the form; never paste into this document
   - **Developer domain:** `kingstonexterior.co.uk`
3. **If visible:** enable **Also assign OneEngine Tenant Developer policy to the initial administrator**. This is an explicit, tenant-scoped policy grant added in PR #540, **not** a paid app licence or platform-admin shortcut. If the checkbox is not visible, use Step 3 for the manual RBAC assignment.
4. Click **Create tenant** once. On timeout, search the existing tenant ID before attempting another submit; provisioning uses an idempotency key.
5. Verify the selected tenant shows **Active** and **Provisioning ready**. Expected starting identities: **two users** — active administrator and disabled `developer@kingstonexterior.co.uk`. Verify its developer seeder is **Pending tenant activation**.
6. If `tanha.ahuja2@gmail.com` is already registered to another tenant, **STOP**. Current identity uniqueness is tenant-specific; do not clone, transfer or delete another tenant's user to force provisioning.

Record status: **PASS / BLOCKED**, with a screenshot showing tenant ID and provisioning status **without credentials**.

## 3 — Give the administrator OneEngine Tenant Developer permissions

1. Sign out of the Platform Administrator session, or use a separate browser profile. Sign in to MetaDrive with the freshly created `tanha.ahuja2@gmail.com` account and the initial password.
2. Navigate to **Setup → Users & Permissions**, relative route `/une/setup/rbac`.
3. Open **Users & Assignments**. Find and expand the entry for the exact email `tanha.ahuja2@gmail.com`.
4. Confirm **Profile = System Administrator** and **User Type = Internal**.
5. In the user's **Permission Sets**, select **OneEngine Tenant Developer** if it was not already assigned. Do **not** create a duplicate permission set or overwrite someone else's policy.
6. Click **Save Changes**. Refresh/reopen the same user and confirm the grant persisted.
7. Open the **Permission Sets** tab and verify `OneEngine_Tenant_Developer` exists. Confirm it is a tenant policy and not `platform:superadmin`.
8. Set the user's **Time Zone (IANA)** to `Europe/London` and **Locale (BCP 47)** to `en-GB`; save. If changing currency to `GBP`, first ensure it has been configured under **Setup → Currencies**.
9. Sign out and back in to ensure the session uses the latest OneEngine grants. Verify the user can see the authorised tenant metadata/Builders but **cannot** enter platform-wide Tenant Management merely due to this grant.

**Developer permission policy ≠ app licence.** Do not try to grant `licence:manage` or `platform:superadmin` via tenant permission metadata. The server deliberately strips these from tenant RBAC.

## 4 — Separate developer identity (optional)

The seeded `developer@kingstonexterior.co.uk` identity starts **disabled**. It is **not required** to operate the main administrator account with Developer permissions. Only activate if the tenant owner wants a distinct developer login:

1. As a tenant security administrator, open **Setup → Company Information** (`/une/setup/company-settings`).
2. Under **Developer account**, verify `developer@kingstonexterior.co.uk`.
3. Select **Activate developer account**, enter and confirm a **new unique password (12+ characters)**, and submit.
4. Confirm **Active** status. After activation, manage its status and permissions through **Users & Permissions / Users**, never through a secret or special email bypass.
5. Do not share or copy the administrator's password to this identity.

## 5 — Domain ownership (optional; do not disrupt the business website)

The **Developer domain** typed during tenant creation controls the seeded developer email address; it does **not** verify DNS ownership, set up tenant routing or enable HTTPS.

If the owner authorises a dedicated MetaDrive domain, prefer a subdomain such as `book.kingstonexterior.co.uk` rather than moving the existing business website:

1. As tenant administrator, open **Setup → Company Information → Custom domains**; alternatively use the selected tenant's **Tenant Management → Custom domains** as a Platform Administrator.
2. Click **Add domain**, enter the owner-approved hostname, then **Save domain**.
3. Copy the **actual DNS TXT record hostname and token value displayed**. Add exactly those details through the authorised DNS provider. Never invent a verification value.
4. After DNS propagation, click **Verify DNS**. The server limits verification retries.
5. **Verified** is DNS ownership only; connecting the hostname to hosting and valid HTTPS/TLS remains a **separate** step. Do not claim tenant-domain login works until HTTPS routing is tested.
6. This domain setup may be **deferred** while tenant and app work are tested on the existing MetaDrive frontend.

## 6 — Mandatory OneAssistant AppExchange availability check

Do not proceed until:
- [ ] PR #540 has passed the mandatory CI, been reviewed, merged and **successfully deployed** (the branch alone is insufficient).
- [ ] OneAssistant has an AppExchange discovery-catalogue entry with **app key `one-assistant`**, normal install/uninstall/trial Flow references and valid trial metadata. **This catalogue entry is not yet present in the reviewed repository.**
- [ ] The normal independent app-package metadata/seeders have been released and OneEngine permissions verified.
- [ ] The user has authorised `connectorApps:view` and `connectorApps:install` rights.

If those checks pass, sign in as the Kingston Exterior administrator and open **Setup → AppExchange** (`/une/setup/app-exchange`). On **Discover apps**, search for **OneAssistant**.

**Stop condition:** If there is no OneAssistant card, record **APP NOT IN CATALOGUE** and stop. Do not create a different connector, copy another tenant's app installation row or modify SQL by hand.

### Install through the frontend

1. Click **OneAssistant → Install** on the discovery card.
2. Verify the detail dialog identifies the booking/reception app.
3. Click **Confirm install**. This invokes the existing **Flow-based AppExchange installation** path.
4. Refresh **Installed apps**. Confirm OneAssistant now appears as **Installed**.
5. Click **Open** to view its app workspace.
6. Remember: **installing does not start a free trial**. Installation, activation, app permissions and entitlements are separate checks.

If **Confirm install** is disabled, verify the user's legitimate OneEngine `connectorApps:install` right and the app's configured `InstallFlow__c`. If it reports no installation Flow, stop and fix the central catalogue/Flow metadata; do not bypass it.

## 7 — Start free trial; paid licence is NOT required

1. From **Installed apps → OneAssistant → Open**, choose the **Licence** tab.
2. Check **Installed: Yes** and that the trial was not already used.
3. Check the displayed **Trial duration**. The current marketplace templates default to **21 days**, but use OneAssistant's *actual displayed* duration when its catalogue entry exists.
4. Click **Start free trial** **once**.
5. Refresh/reopen **Licence** and verify **Trial started** and **Trial expires** have populated dates and the status is active while within the free-trial period.
6. The UI may say **Licence active** for a free trial; distinguish free trial from a paid licence by checking the trial dates.
7. **Do not click Activate / Renew paid licence**. That requires distinct `licence:manage` authority and is unnecessary now.
8. If the trial is already consumed or expired, do not reset `TrialUsed__c` / `TrialStartedAt__c` / `TrialExpiresAt__c` / `LicenceStatus__c` manually. The one-time trial is not renewable by clicking it again.

## 8 — Verify OneAssistant's installed metadata and test behaviour

- [ ] **Setup → App Manager:** locate `OneAssistantApp`.
- [ ] **Page Builder / app navigation:** confirm seeded `ONE_ASSISTANT_RECEPTION` and `ONE_ASSISTANT_SETUP` are present and editable using the normal Builder.
- [ ] **Object Manager:** existing `Appointment`, `Contact`, `Resource`, `AppointmentResource`, `ResourceAvailability` remain intact. Confirm additional `BookingService__c`, `BookingBusinessHours__c`, `BookingPolicy__c`.
- [ ] **Flows:** confirm `ONE_ASSISTANT_BOOKING_REQUEST` is installed, visible and correctly activated.
- [ ] **PC and mobile browser:** shared `OneCalendar`, `OneTable` and Screen Flow components render via the existing metadata renderer; no one-off hardcoded tenant page is needed.
- [ ] Create one clearly fake enquiry. Verify it is saved as **Requested** and **does not** become a confirmed time slot.
- [ ] Reload the frontend and confirm persistence. Check a non-admin user cannot read or mutate tenant data without OneEngine Object/Field/Record/Flow permission.
- [ ] Confirm the app and its metadata are visible **only for the Kingston tenant**; never copy business records or credentials from another tenant.
- [ ] Do not enable live automatic appointment confirmations or messaging until atomic availability checks and live end-to-end validation are complete.

**Product maturity:** The PR is a **booking-request foundation**, not yet a proven transactional appointment booking system. Atomic double-booking prevention, staff/resource availability, confirmation/rescheduling/cancellation and optional WhatsApp/SMS behaviour are separate acceptance gates.

## 9 — Safe troubleshooting

| Symptom | Resolution |
|---|---|
| Tenant Management denies access | Use an authenticated, authorised Platform Administrator. Never elevate tenant RBAC to platform scope. |
| Developer grant checkbox is missing | Expected until PR #540 is deployed; manually assign the existing OneEngine Tenant Developer set in the tenant's **Users & Assignments** screen. |
| Administrator email already registered | Stop: inspect the existing tenant/identity; do not duplicate it. |
| Seeded developer shows disabled | Expected. Activation is tenant-owned and optional. |
| OneAssistant does not appear in AppExchange | Blocked on release **and** AppExchange discovery metadata; do not create a fake connector. |
| Install button disabled / no install Flow | Check connector install rights and canonical install Flow metadata. |
| Installed, but no entitlement | Go to **Open → Licence → Start free trial** if not yet used. |
| Trial expired | Do not restart a one-time trial or silently grant a paid term. |
| Objects, Pages or Flows missing | Stop and investigate SQL seed/lifecycle/release and OneEngine gates; do not manually fake metadata. |
| DNS still pending | Publish the displayed TXT challenge, then retry verification later. |
| 403 / missing permission | Fix via central OneEngine RBAC, not by hardcoding email-based exceptions. |

## 10 — Evidence and sign-off

Use **PASS / BLOCKED / NOT RUN**; record only timestamps and screenshots without passwords, tokens, customer details or private secrets.

| Test | Status |
|---|---|
| Existing tenant ID checked first | NOT RUN |
| `kingstonexterior` created once / Active / Provisioning ready | NOT RUN |
| `tanha.ahuja2@gmail.com` can log in | NOT RUN |
| Tenant Developer permission set assigned to initial administrator | NOT RUN |
| Separate `developer@kingstonexterior.co.uk` user seeded disabled | NOT RUN |
| Platform and cross-tenant access remain denied | NOT RUN |
| OneAssistant discoverable in AppExchange | **BLOCKED: catalogue/release** |
| App installed via **Confirm install** | NOT RUN |
| One-time trial activated with dates visible | NOT RUN |
| Paid licence **not** granted | NOT RUN |
| App, objects, pages, Flows correctly seeded | NOT RUN |
| Safe synthetic request created with Requested status | NOT RUN |
| SQL, OneEngine, browser and booking conflict checks | NOT RUN |
| Optional custom domain validated and routed over HTTPS | NOT RUN |

**Definition of done:** Never call tenant creation, RBAC assignment, app installation, trial activation or full booking functionality complete unless the relevant frontend action and persisted state have been verified. This pilot must comply with [DEVELOPER_POLICY.md](../DEVELOPER_POLICY.md).

### Verified repository UI references

`apps/web/src/TenantManagement.tsx`, `apps/web/src/DeveloperAccountSettings.tsx`, `apps/web/src/permissionsView.tsx`, `apps/web/src/AppExchange.tsx`, `apps/web/src/ConnectorAppWorkspace.tsx`, `apps/web/src/TenantDomains.tsx`, `apps/server/src/core/state/tenant-provisioning.ts`, `apps/server/data/installable-app-packages.json`, `apps/server/data/connector-apps.json`.
