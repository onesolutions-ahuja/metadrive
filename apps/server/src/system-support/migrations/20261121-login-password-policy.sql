-- Core tenant policy. Defaults preserve existing passwords; failed logins are bounded.
CREATE TABLE IF NOT EXISTS md_password_policies (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),
 min_length integer NOT NULL DEFAULT 12 CHECK(min_length BETWEEN 12 AND 128),
 require_uppercase boolean NOT NULL DEFAULT false,
 require_lowercase boolean NOT NULL DEFAULT false,
 require_number boolean NOT NULL DEFAULT false,
 require_symbol boolean NOT NULL DEFAULT false,
 max_age_days integer NOT NULL DEFAULT 0 CHECK(max_age_days BETWEEN 0 AND 365),
 history_count integer NOT NULL DEFAULT 5 CHECK(history_count BETWEEN 0 AND 24),
 max_failed_attempts integer NOT NULL DEFAULT 5 CHECK(max_failed_attempts BETWEEN 3 AND 20),
 lockout_minutes integer NOT NULL DEFAULT 15 CHECK(lockout_minutes BETWEEN 1 AND 1440),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO md_password_policies(tenant_id) SELECT id FROM md_tenants ON CONFLICT DO NOTHING;
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS failed_login_attempts integer NOT NULL DEFAULT 0;
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS password_changed_at timestamptz NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS md_password_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 tenant_id uuid NOT NULL,
 user_id uuid NOT NULL,
 password_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_password_history_user ON md_password_history(tenant_id,user_id,id DESC);
-- Unknown-account failures have no user identity; they still belong to the resolved tenant.
ALTER TABLE md_security_events ALTER COLUMN actor_user_id DROP NOT NULL;
ALTER TABLE md_security_events ADD COLUMN IF NOT EXISTS login_identifier text;
ALTER TABLE md_security_events ADD COLUMN IF NOT EXISTS source_ip text;
