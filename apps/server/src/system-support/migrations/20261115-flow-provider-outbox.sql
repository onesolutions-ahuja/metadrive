-- Provider-backed durable Flow actions must revalidate current SQL activation and permission on dispatch.
-- Preserve all existing queued and completed jobs. No customer data is removed.
ALTER TABLE md_http_callout_jobs
 ADD COLUMN IF NOT EXISTS connection_api text,
 ADD COLUMN IF NOT EXISTS operation_api text,
 ADD COLUMN IF NOT EXISTS operation_path_ciphertext bytea;
ALTER TABLE md_http_callout_jobs
 DROP CONSTRAINT IF EXISTS md_http_callout_provider_pair;
ALTER TABLE md_http_callout_jobs
 ADD CONSTRAINT md_http_callout_provider_pair CHECK (
  (connection_api IS NULL AND operation_api IS NULL AND operation_path_ciphertext IS NULL)
  OR (connection_api ~ '^[A-Za-z][A-Za-z0-9_]*$'
   AND operation_api ~ '^[A-Za-z][A-Za-z0-9_]*$'
   AND operation_path_ciphertext IS NOT NULL));
