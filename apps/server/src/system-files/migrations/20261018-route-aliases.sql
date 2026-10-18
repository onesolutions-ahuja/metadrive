CREATE TABLE IF NOT EXISTS md_route_aliases (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 app_api text NOT NULL,
 slug text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('App Home','App Page','Record List')),
 target_api text NOT NULL,
 status text NOT NULL DEFAULT 'Active' CHECK(status IN ('Active','Disabled')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,app_api,slug)
);
CREATE INDEX IF NOT EXISTS md_route_aliases_active ON md_route_aliases(tenant_id,app_api,status);
