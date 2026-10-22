# Meta WhatsApp Cloud API — Named Credential setup

Credential API name: `WhatsApp_Cloud_API`.

## Required at connection setup

- **Secret:** Meta access token with `whatsapp_business_messaging` permission; stored encrypted.
- **`public_phoneNumberId`:** Registered sender Phone Number ID used for sending messages.
- **Graph API version:** Managed by the connector's versioned operation path (currently `v26.0`), not a tenant input.

The default API host and Bearer authentication come from the connector package.

## Optional, user-added variables

Open **Named Credentials → Edit → Add variable** when you actually need one. For
example, `public_wabaId` for WhatsApp Business Account management or WABA
webhook subscriptions; `public_businessPortfolioId` for asset discovery;
`public_metaAppId` for app setup; `public_businessPhoneE164` for an
informational sender number; `public_templateLanguage` for a preferred
template locale; and `public_displayName` for a descriptive name.

None of these optional variables is provisioned, injected by the frontend, or
required to test the basic messaging connection. For sending a template, its
approved language code is still required **in that message request**.

Secrets (access tokens, webhook signing secrets, app secrets, verification tokens,
PINs and passwords) must never be put in public configuration variables.
Configure inbound webhooks separately with signed-request verification.

Existing tenant credentials, encrypted settings and manually entered optional
variables are preserved when updating the connector.

Official reference:
- https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
