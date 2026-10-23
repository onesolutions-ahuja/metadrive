-- Classify installable packages independently of business-app navigation.
-- Additive and idempotent: installed receipts, tenants, credentials and records are preserved.
ALTER TABLE md_apps
  ADD COLUMN IF NOT EXISTS app_type text NOT NULL DEFAULT 'Application';
ALTER TABLE md_apps
  DROP CONSTRAINT IF EXISTS md_apps_app_type_check;
ALTER TABLE md_apps
  ADD CONSTRAINT md_apps_app_type_check
  CHECK (app_type IN ('Application','ConnectorApp'));
UPDATE md_apps
SET app_type='ConnectorApp'
WHERE tenant_owner_id IS NULL
  AND api_name IN ('WhatsAppConnector','SmsGateConnector','BrevoConnector',
                   'UberEatsConnector','DeliverooConnector','JustEatConnector')
  AND app_type<>'ConnectorApp';
