# Chatter — metadata and security contract

Chatter is **not** a second WhatsApp integration. Reuse `Communication_Records__c`, `WA_ROUTER`, the tenant's Named Credentials and the existing Flow HTTP Callout action. No API tokens belong in browser props or page metadata.

## Admin model
- Each tenant can register one or more WhatsApp channel accounts and connect each account to its own Named Credential and verified Phone Number ID.
- Admin assigns channel-account access to users. Read, Send and Assign grants are independent. A user may have several accounts, and multiple users can share one account.
- Admin sets `viewAllConversations`: when true, the user can see all conversations **only for channel accounts already granted**. When false, only assigned or unassigned conversations for authorised accounts are visible.
- Contact sees the WhatsApp number associated with the chosen channel; the inbox identifies the sending account.
- If a tenant has a single shared account and no assignment restrictions, grant all Chatter users that account and `viewAllConversations`.

## Server-side enforcement to integrate
`src/chatter-access-policy.ts` is a pure helper, **not installed as a route middleware**. Before enabling Chatter in production, derive principal tenant and user from the authenticated request, fetch account grants server-side and call this policy for reads **and** for Flow send/assign actions. Never accept these grants from the client or use UI filters as protection. Incoming WhatsApp messages must resolve channel from trusted webhook Phone Number ID, not just sender number; messages are partitioned by tenant, channel account and contact.

## UI bindings
`Custom:ChatterInbox` is available to Page Builder. Wire its `conversations`, `messages`, `channelAccounts` props to permission-filtered object queries; the component does no network call. The editable page preset supplies Flow action names and input mappings for `send` and `assign`. Those Flow names are **contracts, not pre-existing active Flows**. Define and publish these through Flow Builder before enabling Send/Assign.

Suggested read model: group WhatsApp `Communication_Records__c` records by the account+customer conversation key, then shape records into component props. Messages must remain real object records; never store messaging history in UI metadata.

On send: resolve current user's authorised channel on the backend; confirm recipient and 24-hour service window or use an approved template; create an outgoing message via Flow; issue the HTTP Callout through Named Credentials; write provider message ID/status; reconcile webhook delivery statuses using idempotency keys. Block unsupported media and voice recording.

## Release criteria
1. Tenant A cannot read or send on Tenant B's channels or messages.
2. Without channel grant, View All never reveals that account's chats.
3. Without assigned-conversation visibility, another agent's assigned chat is inaccessible by both API and Flow.
4. Actual sending must use only the server-resolved channel and its Named Credential.
5. Mobile and desktop inbox, sending, webhook updates, and Flow conditions pass end-to-end tests.
