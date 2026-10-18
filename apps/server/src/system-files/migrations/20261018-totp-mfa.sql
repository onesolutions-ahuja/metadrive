-- Tenant policy, encrypted TOTP credentials, short-lived one-time login challenges.
CREATE TABLE IF NOT EXISTS md_tenant_mfa_policy (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),
 mode text NOT NULL DEFAULT 'Disabled' CHECK(mode IN ('Disabled','Optional','Required'))
);
CREATE TABLE IF NOT EXISTS md_user_totp (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 user_id uuid NOT NULL,
 secret_ciphertext bytea NOT NULL,
 pending boolean NOT NULL DEFAULT true,
 pending_token_hash text,
 enrollment_expires_at timestamptz,
 last_counter bigint NOT NULL DEFAULT -1,
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_mfa_login_challenges (
 token_hash text PRIMARY KEY,
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 user_id uuid NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 expires_at timestamptz NOT NULL,
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_mfa_challenge_expiry ON md_mfa_login_challenges(expires_at);
