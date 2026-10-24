-- Follow-up to immutable 20261127-credential-webhooks.sql.
-- Add future replay tolerance without editing an applied migration checksum.
DO $credential_webhook_fk$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname='md_inbound_webhook_credential_fk'
    AND conrelid='md_inbound_webhook_endpoints'::regclass
 ) THEN
  ALTER TABLE md_inbound_webhook_endpoints
   ADD CONSTRAINT md_inbound_webhook_credential_fk
   FOREIGN KEY (tenant_id,credential_id)
   REFERENCES md_named_credentials(tenant_id,id) ON DELETE CASCADE;
 END IF;
END;
$credential_webhook_fk$;
CREATE UNIQUE INDEX IF NOT EXISTS md_inbound_webhook_credential_one
 ON md_inbound_webhook_endpoints(tenant_id,credential_id)
 WHERE credential_id IS NOT NULL;
