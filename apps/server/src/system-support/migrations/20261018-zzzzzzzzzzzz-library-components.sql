CREATE TABLE IF NOT EXISTS md_library_components (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 api_name text NOT NULL,
 label text NOT NULL,
 description text NOT NULL DEFAULT '',
 surfaces text[] NOT NULL DEFAULT '{page}',
 resize jsonb CHECK(resize IS NULL OR jsonb_typeof(resize)='object'),
 jsx_source text NOT NULL DEFAULT '',
 css_source text NOT NULL DEFAULT '',
 compiled_js text NOT NULL DEFAULT '',
 scoped_css text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 published_version integer CHECK(published_version>0),
 status text NOT NULL DEFAULT 'Draft' CHECK(status IN ('Draft','Published')),
 enabled boolean NOT NULL DEFAULT true,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,api_name),
 FOREIGN KEY(tenant_id,api_name) REFERENCES md_component_definitions(tenant_id,api_name),
 CHECK(surfaces <@ ARRAY['page','dashboard','flow','platform']::text[])
);
CREATE TABLE IF NOT EXISTS md_library_component_revisions (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 api_name text NOT NULL,
 version integer NOT NULL CHECK(version>0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,api_name,version),
 FOREIGN KEY(tenant_id,api_name) REFERENCES md_library_components(tenant_id,api_name)
);
