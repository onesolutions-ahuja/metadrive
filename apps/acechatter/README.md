# AceChatter

Dedicated, lazy-loaded WhatsApp-style inbox frontend at `/AceChatter` (canonical lowercase `/acechatter`).

* Authentication: shared `/login`, existing MetaDrive session and configured user landing app `AceChatter`.
* Conversation and message data: tenant-scoped, OneEngine-authorised generic Object metadata and Record APIs. The frontend discovers supported object names; missing schema yields an honest configuration message, not fake chats.
* Sending/assignment/automations: only permitted **active** metadata Flows served by `/flows/available-actions?product=AceChatter`; execution uses the existing Flow runtime. No hardcoded WhatsApp API tokens, transport, or message sends in browser.
* WhatsApp credentials/webhooks: existing tenant Named Credentials and integration services. Inbound provider delivery must be configured through an existing secure integration/Flow, not handled in the frontend.
* Install and publishing, where applicable, remain governed by MetaDrive; navigation registration alone does not grant data permissions.

The UI is maintained here as a standalone app, never by Page Builder. No alternate login, tenant database, RBAC, or workflow engine.

**Setup:** make authorised Conversation/Message metadata available, configure message-to-conversation relationships, activate permitted WhatsApp Flows, set the intended user's landing application to AceChatter. Verify inbound sync and delivery receipts using the tenant's configured provider.

## Flow configuration and data model

AppExchange now discovers AceChatter independently. For **installed, entitled tenants only**, the idempotent app seeder creates missing `ChatConversation` and `ChatMessage` Object/Field definitions, a separately assignable `AceChatterUser` permission set and three editable OneEngine Flows. Existing versions are not modified. It does not create customer conversations or assign permissions to a user.

| Flow API | Inputs | OneEngine output | Initial state |
| --- | --- | --- | --- |
| `AceChatterLoadConversations` | `searchTerm` (Text) | `conversations` (Record Collection) | Active |
| `AceChatterLoadMessages` | `conversationId` (Text) | `messages` (Record Collection) | Active |
| `AceChatterSendMessage` | `conversationId` (Text), `message` (Text) | Configure in Flow Builder | Draft |

Both loading Flows use tenant-scoped, actor-authorised **Get Records** nodes. Edit filters, sorting, selected fields and object relationships in Flow Builder. The conversation search defaults to the `Name` field, while message loading filters by `ConversationId`; these are metadata defaults, not UI business logic. The UI can also render the earlier JSON Text outputs `conversationsJson` and `messagesJson` for compatibility, but native collections need no serialization. Unauthorised users cannot bypass the server's OneEngine RBAC or Record/Field checks.

**Outbound WhatsApp sending deliberately remains a Draft until a tenant administrator configures an appropriate Named Credential, authorised WhatsApp HTTP callout, provider delivery statuses and failure handling.** Activating a no-op send Flow would falsely imply delivery. Incoming WhatsApp webhooks and provider callbacks likewise require tenant-secured integration Flows. Confirm provider consent, conversation-window/template requirements and webhook authenticity before activation.

Assign the `AceChatterUser` permission set explicitly to the intended users and configure their AceChatter landing app in MetaDrive. The seeders do not auto-assign users, grant provider access, or install the app on behalf of tenants.


## WhatsApp Cloud API send draft

`AceChatterSendMessage` includes an editable **HTTP Callout** node with:
- Method: `POST`
- Relative path: `{!phoneNumberId}/messages`
- Body: WhatsApp Cloud API text message JSON, mapping `recipientPhone` and `message`
- Delivery: `DURABLE_ASYNC` through the shared MetaDrive callout dispatcher

In Flow Builder, configure an enabled tenant-scoped HTTPS **Named Credential** with base URL `https://graph.facebook.com/vXX.X/` and the Meta WhatsApp access token. Set the callout's `namedCredentialId` to that saved credential. Replace `vXX.X` with the supported Graph API version. No access token or phone number ID is seeded.

The UI currently supplies `conversationId` and `message`. Before activating, update the Flow to retrieve the selected `ChatConversation`, authorise record access, and resolve `recipientPhone` and `phoneNumberId` from tenant-controlled metadata/settings rather than trusting arbitrary browser input. Configure receipt/inbound webhook Flows independently. **Do not activate until configured and tested.** The send draft is purposely inactive and will not claim a message was delivered.
