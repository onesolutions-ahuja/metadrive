-- Module 11 OAuth Authorization Code: encrypted, single-use PKCE challenges.
-- No JSON/JSONB, no access tokens and no plaintext verifier columns.
CREATE TABLE IF NOT EXISTS md_integration_oauth_challenges (
  state_digest char(64) PRIMARY KEY CHECK (state_digest ~ '^[a-f0-9]{64}$'),
  tenant_id text NOT NULL CHECK (length(tenant_id)>0),
  credential_id text NOT NULL CHECK (length(credential_id)>0),
  redirect_uri text NOT NULL,
  key_id text NOT NULL,
  iv text NOT NULL,
  auth_tag text NOT NULL,
  ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '11 minutes')
);
CREATE INDEX IF NOT EXISTS md_integration_oauth_challenges_expiry
 ON md_integration_oauth_challenges (expires_at);
