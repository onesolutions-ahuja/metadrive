# Tenant calendar, usage and offline metadata

## Business calendar

Company Settings → Business Settings now supports:

- fiscal-year start month and day, suggested as 6 April;
- organization IANA time zone, suggested as `Europe/London`, with the runtime's
  supported time-zone list;
- a seven-day opening-hours list, initially set to 09:00–17:00 on weekdays and
  closed on weekends, with half-hour suggestions, editable custom times, and an
  action to copy Monday's times across the week; and
- dated holidays.

Calendar values are read-only until Edit is selected. For a tenant without a
saved calendar, the suggested values remain local to the form and are not
persisted until an administrator explicitly saves them. Cancel restores the
saved settings or the suggestions. Validation and API errors are shown in the
form rather than being silently blocked by browser-native validation.

The tenant-scoped `GET` and `PUT /api/tenant/business-calendar` endpoints use
the central `TenantSettings` read/manage permissions. Writes are validated,
stored in SQL under the tenant, and audited. Hours are local to the configured
time zone; overnight shifts are not supported. This configuration is available
to AceAssist and other shared scheduling and escalation features; it does not
itself create or change entitlement rules.

## Usage and limits

Company Settings → Business Settings reports tenant object/user/record counts,
estimated record data storage, and authenticated API requests counted for the
current UTC database date. The storage estimate sums record rows, field-value
rows, and uploaded file payload sizes; it excludes indexes, shared platform
metadata, and backups. These are usage measurements, not exact database billing
figures.

Usage targets are advisory and do not block requests or writes. The tenant
usage API does not expose record contents, credentials, request paths, or
request payloads.

## Offline publication, briefcase and mobile layouts

After authenticated metadata loads, the client requests
`GET /api/metadata/offline-publication`, verifies the server digest and
publication revision, and stores display metadata in the existing encrypted,
tenant-and-user-scoped browser cache. The service worker caches the public
application shell and static assets only. Cached metadata never grants access,
restores authentication, contains business records or credentials, or enables
Flow execution while offline.

Company Settings → Mobile & Offline configures a read-only offline briefcase
using object API names and record UUIDs. Central `TenantSettings` permissions
control configuration; record fetches still pass through normal object, record
and field authorization. The API returns the authenticated tenant and user
identity, and does not cache its response at the HTTP layer.

The `apps/mobile` Expo SDK 58 project provides native iOS and Android sign-in,
MFA verification, access-token refresh, manual briefcase sync and read-only
browsing. It stores the access token and per-identity AES-256-GCM key in
SecureStore, while SQLite stores only encrypted record payloads. Authenticated
tenant, user, object and record identifiers are bound as AES-GCM additional
authenticated data. Signing out revokes the server session and clears the
identity's local cache and encryption key. A failed sync keeps the last
successfully synchronized cache.

At sign-in, enter the tenant API URL (HTTPS in release builds), tenant slug,
email and password. `EXPO_PUBLIC_API_URL` can provide an initial URL in a
configured build. Build native development or release binaries with Expo
Continuous Native Generation; the repository intentionally does not check in
generated `ios/` or `android/` directories.

Page Builder also supports Phone form factors and phone-only page assignments.
These assignments remain part of the responsive web/PWA experience; the
briefcase does not run flows or permit record edits offline.

## Package deployment status

Company Settings → Developer supports portable, versioned JSON packages for
custom Objects and fields, Pages, and tenant component-library components.
Administrators can export a package, inspect missing dependencies and
conflicts, then install, upgrade, or uninstall it in another tenant. A SHA-256
digest detects artifact corruption; it does not authenticate the publisher.

Managed package components are read-only to tenant editors while installed.
Unlocked upgrades preserve locally customized components rather than
overwriting them. Uninstall drafts package Pages, disables package-owned
components unless another Page still uses them, and retains Objects and their
records. Retained Objects are unavailable to record operations until the
package is reinstalled; their data is not deleted.

This metadata package lifecycle is separate from connector-app installation
and licensing. It currently packages Objects/fields, Pages, and component
library definitions; it does not package object-manager configuration,
record types, Flows, apps, entitlements, or native mobile application code.
