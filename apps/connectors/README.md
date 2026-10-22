# MetaDrive connector applications

Each provider owns a standalone `scripts/install.mjs` manifest. The shared AppExchange install hook reads only the selected app, requires the existing tenant licence, and creates tenant-scoped Named Credential and provider metadata without secrets. There is no connector login or separate frontend.

Install creates missing configuration and re-enables the managed connection. Uninstall disables only connector-managed resources, retains ciphertext, fields and records, and refuses removal when AppExchange dependencies require the app. Reinstall restores the existing connection. Fields prefixed `public_` are nonsecret metadata; encrypted Secret is configured through Setup > Named Credentials.

**Provider limitations:** Uber Eats/Deliveroo OAuth and merchant authorisation require provider-approved credentials and grant handling. Do not treat credential placeholders as a live connection. WhatsApp webhook signing requires separate secure configuration. SMS Gate supports legacy Basic and provider JWT. Source documentation URLs appear in each script.

## Required fields only

Connector manifests seed only provider-specific inputs needed for their packaged
credential and operations. Authentication secrets stay in the encrypted Named
Credential inputs: WhatsApp's only additional required public variable is
`public_phoneNumberId`. Brevo's `api-key` header and the WhatsApp Graph API
version are defined by their packages, not requested from tenants.

Optional IDs, display names, sender defaults, store IDs and OAuth helper values
are never packaged as blank variable rows. Users can add nonsecret
`public_` variables through **Add variable** as needed. During deployment,
a metadata migration removes obsolete package-owned field declarations for
already-installed connectors; reinstallation also reconciles them. Tenant
credential ciphertext, populated custom variables and existing keys are retained.
