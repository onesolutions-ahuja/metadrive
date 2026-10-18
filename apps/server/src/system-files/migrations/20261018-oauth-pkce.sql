CREATE TABLE IF NOT EXISTS md_credential_oauth_states (
 state_hash text PRIMARY KEY CHECK(length(state_hash)=64),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 credential_id uuid NOT NULL,
 requested_by uuid NOT NULL,
 verifier_ciphertext bytea NOT NULL,
 verifier_key_id text NOT NULL,
 redirect_uri text NOT NULL,
 token_url text NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,credential_id) REFERENCES md_named_credentials(tenant_id,id),
 FOREIGN KEY(tenant_id,requested_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_credential_oauth_states_expiry ON md_credential_oauth_states(expires_at);
CREATE TABLE IF NOT EXISTS md_credential_oauth_tokens (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 credential_id uuid NOT NULL,
 token_ciphertext bytea NOT NULL,
 token_key_id text NOT NULL,
 expires_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,credential_id),
 FOREIGN KEY(tenant_id,credential_id) REFERENCES md_named_credentials(tenant_id,id)
);
