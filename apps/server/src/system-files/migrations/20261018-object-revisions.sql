CREATE TABLE IF NOT EXISTS md_object_revisions (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 object_api text NOT NULL,
 revision bigint NOT NULL,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 changed_by uuid,
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,object_api,revision),
 FOREIGN KEY(tenant_id,changed_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_object_revisions_latest ON md_object_revisions(tenant_id,object_api,revision DESC);
