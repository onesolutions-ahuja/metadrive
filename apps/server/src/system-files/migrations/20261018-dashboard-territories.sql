CREATE TABLE IF NOT EXISTS md_dashboard_territories(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 id uuid NOT NULL,
 label text NOT NULL,
 parent_territory_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,parent_territory_id) REFERENCES md_dashboard_territories(tenant_id,id) DEFERRABLE INITIALLY DEFERRED
);
CREATE TABLE IF NOT EXISTS md_dashboard_territory_users(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 territory_id uuid NOT NULL,
 user_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,territory_id,user_id),
 FOREIGN KEY(tenant_id,territory_id) REFERENCES md_dashboard_territories(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);
