-- Universal, tenant-scoped MFA metadata and one-time authentication challenges.
CREATE TABLE IF NOT EXISTS md_tenant_mfa_policies(
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),
 mode text NOT NULL DEFAULT 'Off' CHECK(mode IN ('Off','Optional','Required')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS md_user_mfa_secrets(
 tenant_id uuid NOT NULL,
 user_id uuid NOT NULL,
 secret_ciphertext bytea NOT NULL,
 key_id text NOT NULL,
 last_counter bigint NOT NULL DEFAULT -1,
 enrolled_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_mfa_enrollment_tokens(
 tenant_id uuid NOT NULL,
 user_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64),
 failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 10),
 secret_ciphertext bytea NOT NULL,
 key_id text NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_mfa_login_challenges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 user_id uuid NOT NULL,
 challenge_hash text NOT NULL UNIQUE CHECK(length(challenge_hash)=64),
 failed_attempts integer NOT NULL DEFAULT 0 CHECK(failed_attempts BETWEEN 0 AND 10),
 enrollment_secret_ciphertext bytea,
 key_id text,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_mfa_login_recent ON md_mfa_login_challenges(tenant_id,user_id,created_at DESC);
ALTER TABLE md_sessions ADD COLUMN IF NOT EXISTS mfa_verified boolean NOT NULL DEFAULT false;
ALTER TABLE md_refresh_sessions ADD COLUMN IF NOT EXISTS mfa_verified boolean NOT NULL DEFAULT false;
