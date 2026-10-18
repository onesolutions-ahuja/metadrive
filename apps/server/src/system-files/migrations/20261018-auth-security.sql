-- Tenant-scoped manual locks, bounded credential guesses, and auditable security changes.
CREATE TABLE IF NOT EXISTS md_user_security_locks (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 user_id uuid NOT NULL,
 locked_until timestamptz NOT NULL,
 created_by uuid,
 locked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_login_attempt_counters (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 email_hash text NOT NULL,
 failures integer NOT NULL CHECK(failures BETWEEN 0 AND 100),
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,email_hash)
);
CREATE TABLE IF NOT EXISTS md_auth_security_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 actor_user_id uuid,
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_auth_security_events_recent ON md_auth_security_events(tenant_id,created_at DESC);
