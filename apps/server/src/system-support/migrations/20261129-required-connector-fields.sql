-- Remove obsolete connector-installed optional field declarations for existing tenants.
-- Named Credential configuration ciphertext and secrets are never modified.
DELETE FROM md_connector_app_fields f
USING md_apps a
WHERE f.app_id=a.id
  AND a.tenant_owner_id IS NULL
  AND a.api_name IN ('WhatsAppConnector','SmsGateConnector','BrevoConnector',
                     'UberEatsConnector','DeliverooConnector','JustEatConnector')
  AND NOT (a.api_name='WhatsAppConnector' AND f.field_api='public_phoneNumberId');
