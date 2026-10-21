# Meta WhatsApp Cloud API — Named Credential setup

Credential API name: `WhatsApp_Cloud_API`. The existing tenant has a **disabled** HTTPS/Bearer placeholder at `https://graph.facebook.com`, with no token entered. This is safe to configure before activating it.

## Editable non-secret variables

| Variable | Enter from Meta | Notes |
| --- | --- | --- |
| `public_graphApiVersion` | Graph API version supported by your app | Example format `vNN.0`; choose a currently supported version |
| `public_wabaId` | WhatsApp Business Account ID | Needed for phone-number lookup and WABA webhook subscription |
| `public_phoneNumberId` | Registered sender Phone Number ID | Used for `POST /{version}/{phoneNumberId}/messages` |
| `public_businessPortfolioId` | Meta Business portfolio ID | For asset discovery/administration |
| `public_metaAppId` | Meta developer App ID | Used when linking app and webhook |
| `public_businessPhoneE164` | Sender business phone | Display/verification reference, not Phone Number ID |
| `public_templateLanguage` | Approved template locale | Typically `en_US` |
| `public_webhookCallbackUrl` | HTTPS endpoint registered with Meta | For inbound message/status deliveries |
| `public_displayName` | Business display name | Optional descriptive setting |

These values use MetaDrive's reusable `public_` variable convention and are saved through the existing Named Credentials editor when you click **Save Changes**. No WhatsApp-specific SQL seeder runs. Only these non-secret settings are shown again for editing. Do not put passwords, access tokens, two-step PINs, verify tokens or App Secret into these fields.

## Confidential fields

- **Secret (Bearer access token):** enter the Meta system-user token here, with `whatsapp_business_messaging` permission. The token is encrypted and never returned by the API.
- **Webhook verification token:** a separately generated random secret; requires a server-side webhook verification handler and secure secret store. Do not put it in publicly returned configuration.
- **Meta App Secret:** separate confidential application secret used to check `X-Hub-Signature-256` on incoming webhook POSTs. Requires secured server-side storage and signature verification. Do not reuse the Bearer token as the App Secret.
- **Phone registration PIN:** 6-digit PIN for initial phone registration, never sent during ordinary messages. Do not store it in client-exposed variables.

## Required Meta configuration

Meta business portfolio, WABA, registered business phone, supported Graph API version, and appropriate system-user access token/scopes. For WABA asset management, `whatsapp_business_management` is also needed. Use `https://graph.facebook.com/{version}/{phoneNumberId}/messages` to send approved message types. Configure an HTTPS webhook endpoint, GET hub challenge verification, signed POST verification and subscribe the Meta app to the WABA.

Activate the Named Credential only after entering a valid Bearer token and IDs, then configure and publish the shared MetaDrive HTTP Callout Flow. **This preset does not activate sending or create a webhook listener.** Respect WhatsApp opt-in, the customer-service messaging window, and approved templates for business-initiated messaging.

Official references:
- https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api
- https://www.postman.com/meta/whatsapp-business-platform/folder/o48mro7/messages
