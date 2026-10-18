-- Durable Screen Flow interviews, tenant-scoped; values are validated on write.
CREATE TABLE IF NOT EXISTS md_screen_interviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 flow_id uuid NOT NULL,
 user_id uuid NOT NULL,
 node_api text NOT NULL,
 state jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(state)='object'),
 status text NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','completed','cancelled')),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,id),
 FOREIGN KEY(tenant_id,flow_id) REFERENCES md_flow_definitions(tenant_id,id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_screen_interviews_owner ON md_screen_interviews(tenant_id,user_id,status);
