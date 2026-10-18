ALTER TABLE md_users ADD COLUMN IF NOT EXISTS locked_until timestamptz;
CREATE TABLE IF NOT EXISTS md_security_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 actor_user_id uuid NOT NULL,
 action text NOT NULL,
 subject_user_id uuid,
 details jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(details)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,subject_user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_security_events_tenant_created ON md_security_events(tenant_id,created_at DESC);
