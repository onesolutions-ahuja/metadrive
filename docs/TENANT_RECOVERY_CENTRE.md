# Tenant Recovery Centre — security implementation (draft)

This change adds **policy guards, PostgreSQL storage schema and regression tests**, not an exposed recovery API. No user, platform operator or support agent can use these files alone to reset a password or obtain a session.

## Required service integration before activation
- Provision a **dedicated Aiven PostgreSQL platform-control database** with a migration role and a separate least-privilege recovery-service role. Never use tenant DB or normal platform API credentials.
- Implement authenticated case submission with generic public responses, rate limiting and abuse controls. Enrol independent verified recovery contacts on tenant creation; require backup methods and prefer passkeys.
- Verify ownership using **pre-enrolled recovery factors and independent organisation evidence**, not solely an email, caller-supplied billing detail or support-agent assertion. Notify all enrolled contacts. Stop on dispute.
- After 24-hour cooling-off, capture two distinct active MFA-authenticated recovery operators. No requester or claimant may approve. Operators may not become the claimant.
- Issue 256-bit cryptographically random invitations, persist **only their SHA-256 digest**; never log plaintext tokens or send them to platform operators. Deliver directly to an independently verified contact.
- Redemption must run in one transaction: lock the case and invitation rows, check tenant/user binding, MFA, timestamps, contact verification, approvers and unused token; atomically consume token and create the **tenant_admin_repair_only** grant for the claimant. On disagreement fail closed.
- Use the restricted grant only for restoring tenant admin capability to an independently verified tenant user; never permit read access to tenant records, secrets or Named Credentials through recovery. Require credential self-enrolment and session revocation, and do not let platform users select or know passwords.
- Keep the pre-existing `developer@tenant` user governed by normal tenant permissions. Never auto-upgrade it or override revoked tenant privileges.
- Integrate with the existing relational-state revision model and JWT revocation; recovery should not directly mutate relational tables outside their checksummed write protocol.
- Add immutable external audit replication and alerting; database triggers alone do not stop a database owner. Add independently accessible incident logs, key management, secret rotation, and retention policy.
- E2E test support compromise, colluding operator, duplicate approval, cross-tenant redemption, stolen invitation, replay, expiration, concurrency, email takeover, recovery-contact change and last-admin lockout.
- Do not expose endpoints or deploy until this security review, delivery channels and Aiven staging rehearsals are complete.

## Scope
This branch intentionally does **not** provision Aiven databases, modify production data, reset credentials, or claim the flow is production ready.
