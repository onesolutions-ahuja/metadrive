CREATE TABLE IF NOT EXISTS md_tenant_recovery_contacts (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 email text NOT NULL,
 verified_at timestamptz,
 enrolled_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,email)
);
CREATE TABLE IF NOT EXISTS md_tenant_security_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 actor_id uuid NOT NULL,
 target_user_id uuid,
 event_type text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,target_user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_tenant_security_events_recent ON md_tenant_security_events(tenant_id,occurred_at DESC);
