# OneChatter — editable MetaDrive app

## Architectural contract

OneChatter is a separate AppExchange catalog entry with an editable SQL-backed
Lightning App Page, **OneChatterInbox**. It does **not** import, modify, fork or
initialise the standalone AceChatter frontend.

The published app version is registered during Core startup for discovery only.
The tenant's page, navigation and assignable `OneChatterUser` permission set are
created only through an entitled tenant's explicit AppExchange installation.
Uninstall and app lifecycle remain owned by the shared App Runtime.

## Component audit

- Reuse **OneConversation** for inbox, conversation list, bubbles, composer,
  desktop/mobile conversation switching and new-conversation form.
- Reuse **OneText** for the separately editable app header. Additional
  **OneInput**, **OneButton**, **OneLookup**, **OneSearch**, **OneSplitPane**,
  **OneOverlay** are already available for further visual customisation.
- New *optional* OneConversation properties: OneEngine-record permission mode,
  default channel, send enablement, preparatory Flow chain, phone normalization,
  participant name formatting and outbound timestamp field.
- General Page Runtime extension accepts bounded, explicitly declared record-list
  properties from authorised Flow output/state mappings. This makes contacts
  reusable without exposing backend read endpoints to the component.

## Configure in Page Builder

1. Install and license OneChatter in AppExchange, then assign the required
   `OneChatterUser` permission set to users who should access it.
2. Open **Page Builder → OneChatter Inbox**. The active App Page has separate
   `OneText` and `OneConversation` elements. Both remain editable and can be
   extended with any registered OneComponent.
3. Bind `OneConversation.objectApiName` to the shared `Communication` object.
   The page preconfigures WhatsApp records and incoming/outgoing direction,
   sender/recipient, body and timestamp mappings. Edit these with the normal
   object/field property pickers.
4. Use **Event → Flow** in the component properties to link the existing
   `AceChatterCreateConversation`, `AceChatterFindConversationByPhone` and
   `AceChatterSendMessage` action Flows. No Flow is copied; the seeder only
   stores references. Flow input mappings can be edited independently per page.
5. If the authorised `AceChatterLoadContacts` Flow is active when OneChatter
   is installed, the `start` event loads contacts through that same Flow.
   Its `contacts` output is bound to page-local `oneChatterContacts` state,
   which feeds the OneConversation contact picker through `contactChoices`.
   The original Flow's current-user filter and OneEngine checks are preserved.
6. Set `sendEnabled` and `enableNewConversation` true only after the
   existing send, create and resolve Flows are active and configured with a
   genuine outbound provider. Fresh packages keep sending disabled otherwise.

## Isolation and lifecycle

- `AceChatter` remains unchanged. `OneChatter` does not seed chat business
  records, duplicate shared objects, clone or edit existing Flow definitions,
  or assign a user permission set automatically.
- The app page is seeded only on explicit installation; reruns preserve
  customer-authored page layout and component property changes.
- OneEngine performs all tenant/object/field/record/Flow checks server-side.
  Rendered read permissions do not imply outbound Flow permission.
- Existing AceChatter Flows declare `appApiName: AceChatter`: these can be
  referenced by OneChatter **while AceChatter itself is installed and
  entitled**. OneChatter's read-only Communication view is independent of
  AceChatter installation. This Flow entitlement guard is intentional and
  must not be bypassed.

## Differences from standalone AceChatter

The new UI uses the reusable OneConversation rendering/layout rather than
duplicating AceChatter CSS, so it is functionally similar but not guaranteed
pixel-identical. The inbox is currently built from permission-filtered
Communication records; AceChatter also merges empty ChatConversation rows
that have no communications yet. Changing those read sources and the contact
picker's optional flow bindings requires Page Builder configuration. The
SendMessage Flow stays unavailable until an administrator configures a
real provider. An end-to-end tenant deployment must verify phone, date,
RBAC, live refresh, provider callouts and mobile layout before go-live.
