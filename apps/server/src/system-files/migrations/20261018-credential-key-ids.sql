ALTER TABLE md_named_credentials
 ADD COLUMN IF NOT EXISTS secret_key_id text NOT NULL DEFAULT 'legacy',
 ADD COLUMN IF NOT EXISTS configuration_key_id text NOT NULL DEFAULT 'legacy';
