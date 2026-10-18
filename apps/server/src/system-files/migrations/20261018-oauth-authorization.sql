ALTER TABLE md_named_credentials ADD COLUMN IF NOT EXISTS oauth_access_ciphertext bytea;
ALTER TABLE md_named_credentials ADD COLUMN IF NOT EXISTS oauth_access_key_id text;
ALTER TABLE md_named_credentials ADD COLUMN IF NOT EXISTS oauth_refresh_ciphertext bytea;
ALTER TABLE md_named_credentials ADD COLUMN IF NOT EXISTS oauth_refresh_key_id text;
ALTER TABLE md_named_credentials ADD COLUMN IF NOT EXISTS oauth_expires_at timestamptz;
CREATE TABLE IF NOT EXISTS md_oauth_authorization_attempts(
 tenant_id uuid NOT NULL,
 state_hash char(64) NOT NULL,
 credential_id uuid NOT NULL,
 user_id uuid NOT NULL,
 verifier_ciphertext bytea NOT NULL,
 verifier_key_id text NOT NULL,
 redirect_uri text NOT NULL,
 token_url text NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 PRIMARY KEY(tenant_id,state_hash),
 FOREIGN KEY(tenant_id,credential_id) REFERENCES md_named_credentials(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_oauth_attempt_expiry ON md_oauth_authorization_attempts(expires_at);
