-- A tenant's pre-created developer identity remains disabled until activated by a
-- security administrator with a fresh authenticator challenge.
CREATE TABLE IF NOT EXISTS md_tenant_developer_accounts (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),
 user_id uuid NOT NULL,
 activated_at timestamptz,
 activated_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,activated_by) REFERENCES md_users(tenant_id,id),
 UNIQUE(tenant_id,user_id)
);
