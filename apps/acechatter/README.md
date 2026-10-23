# AceChatter

Dedicated, lazy-loaded WhatsApp-style inbox frontend at `/AceChatter` (canonical lowercase `/acechatter`).

* Authentication: shared `/login`, existing MetaDrive session and configured user landing app `AceChatter`.
* Conversation, message and contact records are read through tenant-scoped, actor-authorised OneEngine Flows. The frontend does not call the Record API directly; each Flow owns object selection, filters, field projection and RBAC.
* Sending/assignment/automations: only permitted **active** metadata Flows served by `/flows/available-actions?product=AceChatter`; execution uses the existing Flow runtime. No hardcoded WhatsApp API tokens, transport, or message sends in browser.
* WhatsApp credentials/webhooks: existing tenant Named Credentials and integration services. Inbound provider delivery must be configured through an existing secure integration/Flow, not handled in the frontend.
* Install and publishing, where applicable, remain governed by MetaDrive; navigation registration alone does not grant data permissions.

The UI is maintained here as a standalone app, never by Page Builder. No alternate login, tenant database, RBAC, or workflow engine.

**Setup:** make authorised Conversation/Message metadata available, configure message-to-conversation relationships, activate permitted WhatsApp Flows, set the intended user's landing application to AceChatter. Verify inbound sync and delivery receipts using the tenant's configured provider.

## Flow configuration and data model

AppExchange now discovers AceChatter independently. For **installed, entitled tenants only**, the idempotent app seeder creates missing `ChatConversation` and `ChatMessage` Object/Field definitions, a separately assignable `AceChatterUser` permission set and editable OneEngine Flows. Existing versions and customer-authored graphs are preserved. The known seeded send graph is conservatively reconciled to write successful outbound WhatsApp sends to the shared `Communication` object as well as legacy `ChatMessage`. Received WhatsApp messages are read from `Communication`. The seeder does not create customer conversations or assign permissions to a user.

| Flow API | Inputs | OneEngine output | Initial state |
| --- | --- | --- | --- |
| `AceChatterLoadConversations` | `searchTerm` (Text) | `conversations` (Record Collection) | Active |
| `AceChatterLoadMessages` | `conversationId` (Text) | `messages` (Record Collection) | Active |
| `AceChatterLoadContacts` | `searchTerm` (Text) | `contacts` (Record Collection), `sourceObjectApi` (Text) | Active when `Contact` exists; otherwise Draft for configuration |
| `AceChatterCreateConversation` | `chatName`, `phoneNumber`, `sourceObjectApi`, `sourceRecordId` (Text) | Creates or reuses a conversation | Active |
| `AceChatterLoadCommunications` | `searchTerm` (Text; blank loads recent messages, a number filters either participant) | `communications` (Record Collection) | Active |
| `AceChatterFindConversationByPhone` | `phoneNumber` (Text) | `conversations` (Record Collection) | Active |
| `AceChatterSendMessage` | `conversationId` (Text), `message` (Text) | Configure in Flow Builder | Draft |

**New Chat UI:** the mobile inbox uses a full-screen chat list, a WhatsApp-style thread with a back button and bottom composer, and a New Chat picker with **Contacts** and **Phone number** tabs. Contact rows are loaded only by `AceChatterLoadContacts`; the browser never chooses an object API name or reads records directly. The default seeded Flow queries `Contact` records with `OwnerId = {!$User.Id}` and a name search, then returns `sourceObjectApi`. A tenant administrator can edit the Flow's object, user-link filter (for example an assignment/owner relationship), selected fields and `sourceObjectApi` Assignment in Flow Builder. Keep the filter aligned with the intended user-to-contact relationship and rely on OneEngine Record/Field permissions. The Flow is seeded as Draft if the tenant has no `Contact` Object definition.

Selecting a contact passes its Flow-returned record ID and source Object API to the authorised Create Conversation Flow. The conversation stores that provenance in `SourceObjectApi` and `SourceRecordId`. A phone-number chat accepts international notation (including a leading `+`) and uses the same Flow, without creating a contact record.

All loading Flows use tenant-scoped, actor-authorised **Get Records** nodes. `AceChatterLoadCommunications` reads up to 200 newest `Communication` records filtered to `Channel = WhatsApp` and `(Sender contains searchTerm OR Recipient contains searchTerm)`, so incoming senders and outgoing recipients both match. The UI groups both directions by the customer's WhatsApp number, combines them with matching `ChatConversation` records, sorts the thread chronologically and refreshes every five seconds while visible. Sending still uses the existing authorised Flow and a real `ChatConversation` record; if a received-message chat has no conversation record yet, the UI creates it through the configured Create Conversation Flow before sending. These are metadata defaults, not a browser-side CRUD or sending engine. Native record collections are preferred; legacy JSON Text outputs remain supported. Unauthorised users cannot bypass server-side OneEngine RBAC or Record/Field checks.

**Outbound WhatsApp sending deliberately remains a Draft until a tenant administrator configures an appropriate Named Credential, authorised WhatsApp HTTP callout, provider delivery statuses and failure handling.** Activating a no-op send Flow would falsely imply delivery. Incoming WhatsApp webhooks and provider callbacks likewise require tenant-secured integration Flows. Confirm provider consent, conversation-window/template requirements and webhook authenticity before activation.

The OneEngine permission set includes default execute access for `AceChatterLoadCommunications` and read access for the WhatsApp Communication fields it needs. Flow execution still runs in the signed-in user's context and obeys record/field access and explicit RBAC denies. Assign OneEngine explicitly only to users who should have its configurable full-access permission set. Alternatively, assign `AceChatterUser` for the app's scoped permissions. The seeders do not auto-assign users, grant provider access, or install the app on behalf of tenants.


## WhatsApp Cloud API send draft

`AceChatterSendMessage` includes an editable **HTTP Callout** node with:
- Method: `POST`
- Relative path: `v26.0/{!public_phoneNumberId}/messages`
- Body: WhatsApp Cloud API text message JSON, mapping the authorised conversation's `PhoneNumber` and the Flow's `message` input
- Delivery: `DURABLE_ASYNC` through the shared MetaDrive callout dispatcher

In Flow Builder, configure an enabled tenant-scoped HTTPS **Named Credential** with base URL `https://graph.facebook.com/` and the Meta WhatsApp access token plus the non-secret `public_phoneNumberId` setting. Set the callout's `namedCredentialId` to that saved credential. The Flow path carries the Graph API version (`v26.0` here); change it to a version supported by your Meta app when needed. No access token or phone number ID is seeded.

The UI supplies only `conversationId` and `message`. The seeded Flow retrieves the selected `ChatConversation` through OneEngine, resolves its `PhoneNumber`, and addresses the Graph API using `{!public_phoneNumberId}` supplied by the selected encrypted Named Credential. The shared callout runtime binds `public_` values from that credential only and fails closed if the required setting is absent. Configure the tenant Named Credential and validate/activate the Flow only after provider tests. The Flow remains Draft on a fresh install until configured; the UI never claims provider delivery from Flow execution alone.


### Recipient and sender lookup (secure Flow defaults)

The WhatsApp send Flow reads the **ChatConversation** by `conversationId` through the shared, actor-authorised Get Records node and uses `{!conversation.PhoneNumber}` for the recipient. The Graph API path is `v26.0/{!public_phoneNumberId}/messages`; `public_phoneNumberId` must be configured as a non-secret public setting on the selected tenant Named Credential. No duplicate ChatChannelSettings sender record is required. The browser never chooses the recipient or sender independently.


## Central integration activity in Communication

The shared Named Credential / HTTP Callout runtime automatically creates one tenant-scoped `Communication` record for every outgoing HTTP attempt, including success, HTTP failure and network failure. Inbound webhook attempts use the same central writer; when a webhook already creates the actual inbound message or event Communication record, the runtime avoids creating a second record for that same event. No Flow `Create Records` node is needed for API activity logging.

Generic API activity uses `Channel = Other` and stores safe metadata such as direction, provider/credential reference, endpoint path without query strings, method, HTTP status, outcome, duration and byte counts. Request/response payloads, authorization headers, signatures, credentials and query strings are not stored by default. A shared HTTP Callout may optionally define a metadata-driven `communicationLog` mapping when its request is an actual business message; AceChatter uses that mapping so the central runtime writes the WhatsApp Communication with the recipient, message text and provider message ID. The seeded AceChatter Flow keeps its legacy `ChatMessage` for compatibility, but no longer creates a second Communication record.
