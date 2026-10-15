# Shared record write-policy extraction

Migration owner: Codex, existing UK Off Licence POS completion (PR #451).

The server entrypoint started at 13,515 lines for this work. The object and field
permission evaluators are extracted into `record-write-policy.ts`; the entrypoint
shrinks while retaining its existing dependency injection contracts. New modules
remain responsibility-based.

The policy is generic SQL-backed Object metadata. It adds restrictions to the
central object/field/record checks and never grants permissions. Only server-created
AsyncLocalStorage execution context can identify an approved Flow, including nested
Flows and interview resumes. Request input cannot provide this context. Policies
can restrict whole-object mutations, selected fields, or records marked by a
protected field. Unconfigured objects retain their current behaviour.

Changing policy metadata or removing a protected field requires security:manage.
Trusted package installers may seed an initial policy when introducing its fields;
they must preserve existing administrator policy choices.

The remaining server extraction debt is not addressed by this change.
