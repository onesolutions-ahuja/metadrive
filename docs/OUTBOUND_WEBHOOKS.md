# Outbound webhooks

Tenant administrators with `WebhookSubscription:manage` can configure
Platform Event webhook subscriptions through `/api/metadata/webhooks`. Each
subscription references an enabled HTTPS Named Credential and a relative path;
credential secrets are never returned by the subscription API.

The worker creates one durable delivery per event/subscription pair and sends
the event name, ID, replay ID, publication time, and typed payload as JSON.
Delivery uses the shared Named Credential HTTPS transport, including its
origin/DNS restrictions, authentication, request limits, and idempotency key.
Subscriptions start after the latest tenant event replay ID when created.

Every execution rechecks the subscription, event, credential, tenant, user,
and current RBAC grants. Uncertain HTTP outcomes are not automatically retried:
the delivery is marked failed so an operator can review the remote system
before any manual reconciliation. This avoids silently duplicating external
side effects.
