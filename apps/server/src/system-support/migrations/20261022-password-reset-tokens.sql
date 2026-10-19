-- Ephemeral one-time password reset challenges. Never persist plaintext tokens.
CREATE TABLE IF NOT EXISTS md_password_reset_challenges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,
 user_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE CHECK (length(token_hash)=64),
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_password_reset_user_recent
 ON md_password_reset_challenges(tenant_id,user_id,created_at DESC);
