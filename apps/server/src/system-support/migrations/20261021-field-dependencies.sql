CREATE TABLE IF NOT EXISTS md_field_dependencies (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  field_api text NOT NULL,
  controller_field_api text NOT NULL,
  PRIMARY KEY(tenant_id,object_api,field_api),
  CHECK(field_api<>controller_field_api),
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,object_api,controller_field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_field_dependency_values (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  field_api text NOT NULL,
  controller_value text NOT NULL CHECK(length(controller_value) BETWEEN 1 AND 512),
  picklist_value text NOT NULL CHECK(length(picklist_value) BETWEEN 1 AND 512),
  PRIMARY KEY(tenant_id,object_api,field_api,controller_value,picklist_value),
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_dependencies(tenant_id,object_api,field_api) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_field_dependency_values_lookup
  ON md_field_dependency_values(tenant_id,object_api,field_api,controller_value);
