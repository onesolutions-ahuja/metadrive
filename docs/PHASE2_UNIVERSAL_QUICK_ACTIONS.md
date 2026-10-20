# Phase 2 — Universal Quick Actions (implementation in progress)

## Current first milestone

Extend the existing `md_object_actions` SQL metadata registry and Object
Manager browser configuration rather than introduce an app-specific Action
engine. Supported Object action behaviors:
- **Set Field Value**: existing capability, now executed via the shared
  record action API; validates Object/Record/Field rights in RecordEngine.
- **Log Call**: reuses the central record activity service and creates a
  completed Call activity.
- **Run Flow**: launch a saved Flow via the existing Flow Runtime. The
  browser uses the existing Screen Flow interface after the server
  authorizes action and Flow execution.
- **Create Related**: builder selects an existing child Object and
  relationship Field. The browser reuses the generic record creation
  form. The server validates the active child relationship, Action and
  Record permissions, and forcibly binds the source parent ID.

SQL upgrade: `20261107-universal-object-actions.sql`; schema.sql
contains the same behavior contract. Existing Standard actions, custom
field actions and customer field values remain in place.

## OneEngine RBAC

The backend requires the caller's `Action:<objectApi>.<actionId>`
`execute` grant plus Object read and source Record read access.
The Record Engine, Activity service and Flow Runtime independently enforce
their existing edit/create/Field/Record/Flow permission checks. Action
metadata and action permission are distinct. The browser requests a
permission-filtered list of available action IDs before displaying
configured record actions.

## Generic API

- `GET /api/records/:objectApi/:id/actions`: available action IDs.
- `GET /api/records/:objectApi/:id/actions/:actionId/flow-launch`:
  validate action and Flow execution permission and return contextual
  Flow inputs without running the Flow twice.
- `POST /api/records/:objectApi/:id/actions/:actionId/execute`:
  execute metadata-backed update, call, related creation, or automated Flow
  through one shared runtime. The runtime never trusts client-supplied
  behavior, target object, Flow ID or relationship Field.

## Still in Phase 2

Global Quick Actions and their unified metadata scope, Send Email action
with secure Named Credentials, configurable action placement in the Page
Builder, input dialogs and mappings, additional no-code validation and
screen-reader UX, seeded per-action permission defaults and wider
integration tests.

This is a **draft PR** until all CI and remaining Phase 2 acceptance
requirements pass. No part of the implementation should be reported as
fully validated merely because it is committed.

## Durable SMTP delivery (20261110)

Object and global Send Email Quick Actions enqueue encrypted payloads into
`md_quick_action_email_jobs` through the existing NamedCredentialService.
The tenant/user-scoped `requestKey` deduplicates browser retries; reusing a
key for a different email is rejected. The shared communication worker claims
one job using SQL `FOR UPDATE SKIP LOCKED`, rechecks the tenant, live action,
credential, actor and OneEngine permissions and sends through the existing
SMTP transport. A crash or SMTP error after dispatch begins is quarantined as
`DELIVERY_OUTCOME_UNKNOWN` rather than automatically retried, preventing
uncontrolled duplicate side effects. Queue and delivery failures are audited.
The browser says **queued**, not **sent**, until actual delivery is confirmed.
The queue contains ciphertext, not plaintext recipient/message body.

Phase 2 remains in review until fresh-install and upgraded SQL, all automated
checks, Chromium E2E, optional app isolation and SMTP failure handling pass.
