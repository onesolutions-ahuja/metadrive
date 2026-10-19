CREATE TABLE IF NOT EXISTS md_object_manager_settings (
  tenant_id uuid NOT NULL REFERENCES md_tenants(id),
  object_api text NOT NULL,
  plural_label text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  help_text text NOT NULL DEFAULT '',
  allow_reports boolean NOT NULL DEFAULT true,
  allow_activities boolean NOT NULL DEFAULT false,
  track_field_history boolean NOT NULL DEFAULT false,
  allow_in_chatter boolean NOT NULL DEFAULT false,
  allow_search boolean NOT NULL DEFAULT true,
  deployment_status text NOT NULL DEFAULT 'Deployed'
    CHECK(deployment_status IN ('In Development','Deployed')),
  record_name_type text NOT NULL DEFAULT 'Text'
    CHECK(record_name_type IN ('Text','Auto Number')),
  record_name_format text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,object_api),
  FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE,
  CHECK(length(description)<=1000),
  CHECK(length(plural_label)<=160),
  CHECK(length(help_text)<=1000),
  CHECK(length(record_name_format)<=80)
);
CREATE TABLE IF NOT EXISTS md_object_field_sets (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  api_name text NOT NULL,
  label text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY(tenant_id,object_api,api_name),
  FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE,
  CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  CHECK(length(label) BETWEEN 1 AND 80)
);
CREATE TABLE IF NOT EXISTS md_object_field_set_items (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  field_set_api text NOT NULL,
  field_api text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY(tenant_id,object_api,field_set_api,field_api),
  FOREIGN KEY(tenant_id,object_api,field_set_api)
    REFERENCES md_object_field_sets(tenant_id,object_api,api_name) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE
);
