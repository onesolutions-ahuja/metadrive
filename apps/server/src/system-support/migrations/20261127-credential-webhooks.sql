-- Optional inbound webhooks belong to a Named Credential, not to a Flow or app.
-- Older app/Flow webhook endpoints remain valid.
ALTER TABLE md_inbound_webhook_endpoints
  ADD COLUMN IF NOT EXISTS credential_id uuid;
ALTER TABLE md_inbound_webhook_endpoints ALTER COLUMN app_id DROP NOT NULL;
ALTER TABLE md_inbound_webhook_endpoints ALTER COLUMN flow_api DROP NOT NULL;
ALTER TABLE md_inbound_webhook_endpoints ALTER COLUMN execution_user_id DROP NOT NULL;
ALTER TABLE md_inbound_webhook_endpoints
  ADD CONSTRAINT md_inbound_webhook_credential_fk
  FOREIGN KEY (tenant_id,credential_id)
  REFERENCES md_named_credentials(tenant_id,id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS md_inbound_webhook_credential_one
  ON md_inbound_webhook_endpoints(tenant_id,credential_id)
  WHERE credential_id IS NOT NULL;
