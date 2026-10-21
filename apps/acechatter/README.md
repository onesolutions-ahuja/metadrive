# AceChatter

Dedicated, lazy-loaded WhatsApp-style inbox frontend at `/AceChatter` (canonical lowercase `/acechatter`).

* Authentication: shared `/login`, existing MetaDrive session and configured user landing app `AceChatter`.
* Conversation and message data: tenant-scoped, OneEngine-authorised generic Object metadata and Record APIs. The frontend discovers supported object names; missing schema yields an honest configuration message, not fake chats.
* Sending/assignment/automations: only permitted **active** metadata Flows served by `/flows/available-actions?product=AceChatter`; execution uses the existing Flow runtime. No hardcoded WhatsApp API tokens, transport, or message sends in browser.
* WhatsApp credentials/webhooks: existing tenant Named Credentials and integration services. Inbound provider delivery must be configured through an existing secure integration/Flow, not handled in the frontend.
* Install and publishing, where applicable, remain governed by MetaDrive; navigation registration alone does not grant data permissions.

The UI is maintained here as a standalone app, never by Page Builder. No alternate login, tenant database, RBAC, or workflow engine.

**Setup:** make authorised Conversation/Message metadata available, configure message-to-conversation relationships, activate permitted WhatsApp Flows, set the intended user's landing application to AceChatter. Verify inbound sync and delivery receipts using the tenant's configured provider.
