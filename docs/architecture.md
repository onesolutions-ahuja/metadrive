# MetaDrive architecture

**Authority:** [DEVELOPER_POLICY.md](../DEVELOPER_POLICY.md) and [AGENTS.md](../AGENTS.md). This is a navigational specification, not a replacement.

MetaDrive has one tenant-isolated SQL metadata platform, one shared Record/Action/Flow runtime, one component renderer, one central RBAC permission engine with OneEngine permission sets, and independent installable apps. Core must operate without optional apps. Builders load only when opened and are not included in published app runtime bundles.

- Current approved roadmap: [METADRIVE_ACTUAL_PLAN.md](METADRIVE_ACTUAL_PLAN.md)
- Shared source boundaries: [server-code-organisation.md](server-code-organisation.md), [web-lazy-loading.md](web-lazy-loading.md)
- Security and audit: [SECURITY_GOVERNANCE_PHASE3.md](SECURITY_GOVERNANCE_PHASE3.md)
- Releases: [THREE_PART_AUDIT_RELEASE_EVIDENCE_20261019.md](THREE_PART_AUDIT_RELEASE_EVIDENCE_20261019.md)

SQL stores tenant-specific published metadata, settings, permissions, app installations and business records. All requests and durable jobs enforce tenant, installation, entitlement and RBAC separately. App seeders are independent, versioned, idempotent and customisation-safe. An uninstall disables app capabilities but retains customer data. No separate business CRUD or workflow engines are permitted.
