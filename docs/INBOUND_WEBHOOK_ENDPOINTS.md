# Inbound Webhook Endpoints

Open **Setup → Integrations → Webhook Endpoints** (shared integration settings).

Create an endpoint for any **installed and entitled app**. Choose an **active Autolaunched Flow** and an explicitly authorised execution user. This is a universal SQL-owned callback registry, not an AceChatter-specific endpoint or a second workflow engine.

- **Meta / WhatsApp**: Register the generated HTTPS callback URL in Meta Developer Settings. Enter the same Verify Token in both places. Meta sends a GET request with `hub.mode=subscribe`, `hub.verify_token` and `hub.challenge`. The endpoint hashes and compares the token, then echoes the challenge.
- **Signed POST**: Incoming raw request bytes must pass `X-Hub-Signature-256` HMAC-SHA256 validation using the Meta App Secret stored encrypted by MetaDrive's shared credential vault. Invalid signatures cannot reach SQL inbox records or Flows.
- **Generic HMAC-SHA256**: Supports other signed POST providers using the same signature header, without the Meta GET handshake.
- **App lifecycle**: Disabled, uninstalled, or unlicensed apps cannot receive deliveries. Server-side Flow and execution-user RBAC is rechecked for every message.
- **Events and auditing**: Verified bodies go to tenant-scoped SQL `md_inbound_webhook_events`, deduplicated by endpoint/payload hash. A shared Flow receives `webhookEventId`, `webhookEndpoint`, `requestId` and `webhookPayloadJson` (only when 4,096 characters or shorter). The raw verified JSON remains in tenant SQL. Creation/status changes are audited.
- **Credentials**: Secrets are never returned to clients; enabling/adding endpoints requires `WebhookSubscription:manage`, reading them requires `WebhookSubscription:read`.

For **AceChatter**, use a dedicated metadata Flow such as `AceChatterReceiveWebhook` to map inbound message and delivery status updates into the existing `ChatConversation` and `ChatMessage` Objects. **Create, publish, authorise, and test that Flow before selecting it.** This setup does not seed live provider credentials, invent WhatsApp delivery events, or automatically activate inbound processing.

This is the same design separation as Salesforce's outbound Named Credentials/External Services versus authenticated, externally callable REST endpoints; it avoids hardcoding any particular provider inside MetaDrive's app runtime.

Operational note: Callback Flow execution currently occurs in the HTTP request and must finish within the provider timeout. Verified payloads are preserved, but this implementation is **not yet a durable worker-based inbound replay processor**, and the browser does not expose detailed replay/retry controls. Add those as shared engine upgrades before relying on high-volume WhatsApp ingestion.
