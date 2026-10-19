-- Tenant-scoped immutable dashboard results; snapshots do not confer data access.
CREATE TABLE IF NOT EXISTS md_dashboard_snapshots(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 dashboard_kind text NOT NULL DEFAULT 'dashboards' CHECK(dashboard_kind='dashboards'),
 dashboard_api text NOT NULL,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 200),
 created_by uuid NOT NULL,
 content jsonb NOT NULL CHECK(jsonb_typeof(content)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES md_users(tenant_id,id),
 FOREIGN KEY(tenant_id,dashboard_kind,dashboard_api) REFERENCES md_system_definitions(tenant_id,kind,api_name)
);
CREATE INDEX IF NOT EXISTS md_dashboard_snapshots_lookup
 ON md_dashboard_snapshots(tenant_id,dashboard_api,created_at DESC);
