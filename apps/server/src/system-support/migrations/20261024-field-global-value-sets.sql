CREATE TABLE IF NOT EXISTS md_field_global_value_sets (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  field_api text NOT NULL,
  value_set_api text NOT NULL,
  PRIMARY KEY(tenant_id,object_api,field_api),
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,value_set_api)
    REFERENCES md_global_value_sets(tenant_id,api_name) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS md_field_global_value_sets_lookup
  ON md_field_global_value_sets(tenant_id,value_set_api);
