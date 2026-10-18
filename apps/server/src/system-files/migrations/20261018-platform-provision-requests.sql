CREATE TABLE IF NOT EXISTS md_platform_provision_requests(
 operator_tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 request_key uuid NOT NULL,
 tenant_slug text NOT NULL,
 requested_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(operator_tenant_id,request_key),
 FOREIGN KEY(operator_tenant_id,requested_by) REFERENCES md_users(tenant_id,id)
);
