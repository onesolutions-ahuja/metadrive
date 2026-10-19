CREATE TABLE IF NOT EXISTS md_platform_event_messages (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 event_api_name text NOT NULL,
 published_by uuid NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','queued','completed','failed')),
 idempotency_key text,
 error_code text,
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,published_by) REFERENCES md_users(tenant_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS md_platform_event_messages_idempotency
 ON md_platform_event_messages(tenant_id,event_api_name,idempotency_key)
 WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS md_platform_event_messages_pending
 ON md_platform_event_messages(tenant_id,published_at,id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS md_platform_event_values (
 tenant_id uuid NOT NULL,
 event_id uuid NOT NULL,
 field_api text NOT NULL,
 value_kind text NOT NULL CHECK(value_kind IN ('string','number','boolean','null')),
 value_text text,
 PRIMARY KEY(tenant_id,event_id,field_api),
 FOREIGN KEY(tenant_id,event_id) REFERENCES md_platform_event_messages(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_platform_event_deliveries (
 tenant_id uuid NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 event_id uuid NOT NULL,
 flow_id uuid NOT NULL,
 flow_version integer NOT NULL CHECK(flow_version>0),
 actor_user_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','completed','failed')),
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 PRIMARY KEY(tenant_id,id),
 UNIQUE(tenant_id,event_id,flow_id),
 FOREIGN KEY(tenant_id,event_id) REFERENCES md_platform_event_messages(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,flow_id) REFERENCES md_flow_definitions(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_platform_event_deliveries_queue
 ON md_platform_event_deliveries(tenant_id,status,created_at,id) WHERE status='queued';
