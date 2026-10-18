-- Durable generic notifications and approval requests, tenant scoped and non-destructive.
CREATE TABLE IF NOT EXISTS md_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 recipient_id uuid NOT NULL,
 sent_by uuid,
 title text NOT NULL CHECK(length(title)<=200),
 body text NOT NULL CHECK(length(body)<=5000),
 flow_api_name text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 read_at timestamptz,
 FOREIGN KEY (tenant_id,recipient_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY (tenant_id,sent_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_notifications_recipient ON md_notifications(tenant_id,recipient_id,created_at DESC);
CREATE TABLE IF NOT EXISTS md_approval_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 group_id uuid NOT NULL DEFAULT gen_random_uuid(),
 object_api_name text NOT NULL,
 object_label text NOT NULL,
 record_id uuid NOT NULL,
 record_name text NOT NULL DEFAULT '',
 flow_api_name text NOT NULL DEFAULT '',
 submitted_by uuid NOT NULL,
 approver_id uuid NOT NULL,
 status text NOT NULL DEFAULT 'Pending' CHECK(status IN ('Pending','Approved','Rejected','Canceled')),
 comments text NOT NULL DEFAULT '',
 decision_comments text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 decided_by uuid,
 FOREIGN KEY(tenant_id,record_id) REFERENCES md_records(tenant_id,id),
 FOREIGN KEY(tenant_id,submitted_by) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,approver_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,decided_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_approval_requests_approver ON md_approval_requests(tenant_id,approver_id,status,created_at DESC);
