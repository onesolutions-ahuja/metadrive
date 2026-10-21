# AceChatter

Dedicated, lazy-loaded WhatsApp-style inbox frontend at `/AceChatter` (canonical lowercase `/acechatter`).

* Authentication: shared `/login`, existing MetaDrive session and configured user landing app `AceChatter`.
* Conversation and message data: tenant-scoped, OneEngine-authorised generic Object metadata and Record APIs. The frontend discovers supported object names; missing schema yields an honest configuration message, not fake chats.
* Sending/assignment/automations: only permitted **active** metadata Flows served by `/flows/available-actions?product=AceChatter`; execution uses the existing Flow runtime. No hardcoded WhatsApp API tokens, transport, or message sends in browser.
* WhatsApp credentials/webhooks: existing tenant Named Credentials and integration services. Inbound provider delivery must be configured through an existing secure integration/Flow, not handled in the frontend.
* Install and publishing, where applicable, remain governed by MetaDrive; navigation registration alone does not grant data permissions.

The UI is maintained here as a standalone app, never by Page Builder. No alternate login, tenant database, RBAC, or workflow engine.

**Setup:** make authorised Conversation/Message metadata available, configure message-to-conversation relationships, activate permitted WhatsApp Flows, set the intended user's landing application to AceChatter. Verify inbound sync and delivery receipts using the tenant's configured provider.

## Required Flow Builder contracts

The app never calls a Record endpoint to load conversations or messages. Create **active, executable Autolaunched Flows** under the current tenant, grant their execution through OneEngine and choose all Object/Record/Field filters within the Flows:

| Flow API name | Declared inputs | Synchronous output Text variable |
| --- | --- | --- |
| `AceChatterLoadConversations` | `searchTerm` (Text), `limit` (Number) | `conversationsJson` |
| `AceChatterLoadMessages` | `conversationId` (Text), `limit` (Number) | `messagesJson` |
| `AceChatterSendMessage` | `conversationId` (Text), `message` (Text) | Flow-specific result |

Read Flows must complete synchronously and return an output variable containing a JSON array of at most 200 objects. The shared Flow runtime currently publishes declared output **scalar variables**, not arbitrary record collections; the Flow must map/serialize the intended data to Text output (or the reusable shared Flow serializer must be extended if unavailable). The UI validates the result and fails closed instead of exposing a direct, unfiltered Object API fallback.

Example conversation: `[{"Id":"conv-id","Name":"Customer"}]`. Example message: `[{"Id":"msg-id","Body":"Hello","Direction":"Inbound","SentAt":"2026-10-21T10:00:00Z"}]`. These are **output schema examples only**, never demo records shown in the UI.

All filtering, conversation assignment, message membership, sort and limit are defined by the Flow owner; the browser passes the search text and selected conversation ID, and renders only returned rows. The Flow must validate that the requested conversation is accessible by the actor. No alternate WhatsApp transport or message CRUD path is provided.
