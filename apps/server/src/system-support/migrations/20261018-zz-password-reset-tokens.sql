CREATE TABLE IF NOT EXISTS md_password_reset_requests (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 user_id uuid NOT NULL,
 token_hash text NOT NULL,
 method text NOT NULL CHECK(method IN ('OTP','LINK')),
 requested_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 delivered_at timestamptz,
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_password_reset_throttle (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 email_hash text NOT NULL,
 request_count integer NOT NULL DEFAULT 0,
 window_start timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,email_hash)
);
