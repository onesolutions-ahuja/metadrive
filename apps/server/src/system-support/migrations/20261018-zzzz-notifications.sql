-- Durable tenant- and recipient-scoped shared notifications.
CREATE TABLE IF NOT EXISTS md_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 recipient_id uuid NOT NULL,
 title text NOT NULL,
 body text NOT NULL DEFAULT '',
 flow_api_name text NOT NULL DEFAULT '',
 sent_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz,
 FOREIGN KEY(tenant_id,recipient_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,sent_by) REFERENCES md_users(tenant_id,id),
 UNIQUE(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_notifications_inbox ON md_notifications(tenant_id,recipient_id,created_at DESC);
