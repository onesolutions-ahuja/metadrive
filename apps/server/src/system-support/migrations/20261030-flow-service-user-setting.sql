CREATE TABLE IF NOT EXISTS md_tenant_automation_settings (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id) ON DELETE CASCADE,
 flow_service_user_id uuid,
 updated_by uuid NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,flow_service_user_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES md_users(tenant_id,id)
);
