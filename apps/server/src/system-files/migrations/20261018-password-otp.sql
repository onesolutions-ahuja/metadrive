CREATE TABLE IF NOT EXISTS md_password_reset_otps (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 user_id uuid NOT NULL,
 otp_hash text NOT NULL,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_password_reset_expiry ON md_password_reset_otps(expires_at);
