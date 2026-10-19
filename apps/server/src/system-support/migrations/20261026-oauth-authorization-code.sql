-- Tenant-scoped OAuth Authorization Code + PKCE grants and encrypted provider tokens.
CREATE TABLE IF NOT EXISTS md_credential_oauth_grants(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 credential_id uuid NOT NULL,
 initiated_by uuid NOT NULL,
 state_hash text NOT NULL UNIQUE CHECK(length(state_hash)=64),
 verifier_ciphertext bytea NOT NULL,
 key_id text NOT NULL,
 redirect_uri text NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,credential_id) REFERENCES md_named_credentials(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,initiated_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_oauth_grants_tenant_recent ON md_credential_oauth_grants(tenant_id,credential_id,created_at DESC);
CREATE TABLE IF NOT EXISTS md_credential_oauth_tokens(
 tenant_id uuid NOT NULL,
 credential_id uuid NOT NULL,
 key_id text NOT NULL,
 access_ciphertext bytea NOT NULL,
 refresh_ciphertext bytea,
 expires_at timestamptz NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,credential_id),
 FOREIGN KEY(tenant_id,credential_id) REFERENCES md_named_credentials(tenant_id,id) ON DELETE CASCADE
);
