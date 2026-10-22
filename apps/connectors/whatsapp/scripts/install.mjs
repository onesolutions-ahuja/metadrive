/** WhatsApp Connector: install-time, non-secret connector definition. Tenant secrets are never packaged. */
export default Object.freeze({
  "folder": "whatsapp",
  "appApi": "WhatsAppConnector",
  "label": "WhatsApp Connector",
  "description": "Meta WhatsApp Cloud API credential and callout definitions",
  "credential": "WhatsApp_Cloud_API",
  "url": "https://graph.facebook.com/",
  "auth": "Bearer",
  "header": "",
  "fields": [
    {
      "apiName": "public_graphApiVersion",
      "label": "Graph API version",
      "required": true,
      "defaultValue": ""
    },
    {
      "apiName": "public_wabaId",
      "label": "WhatsApp Business Account ID",
      "required": true,
      "defaultValue": ""
    },
    {
      "apiName": "public_phoneNumberId",
      "label": "Sender Phone Number ID",
      "required": true,
      "defaultValue": ""
    },
    {
      "apiName": "public_metaAppId",
      "label": "Meta App ID",
      "required": false,
      "defaultValue": ""
    },
    {
      "apiName": "public_businessPhoneE164",
      "label": "Business phone E.164",
      "required": false,
      "defaultValue": ""
    },
    {
      "apiName": "public_templateLanguage",
      "label": "Template locale",
      "required": false,
      "defaultValue": ""
    }
  ],
  "operations": {
    "SendMessage": {
      "method": "POST",
      "path": "{!graphApiVersion}/{!phoneNumberId}/messages"
    }
  },
  "docs": "https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api",
  "notes": "Secret: Meta system-user access token. Register WhatsApp webhooks separately with a verified Meta App Secret; not enabled without signing key."
});
