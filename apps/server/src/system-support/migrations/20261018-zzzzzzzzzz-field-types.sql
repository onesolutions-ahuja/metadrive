-- Extended scalar field metadata stays fully relational and tenant-scoped.
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS picklist_restricted boolean NOT NULL DEFAULT true;
CREATE TABLE IF NOT EXISTS md_field_picklist_values (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  field_api text NOT NULL,
  value text NOT NULL CHECK(length(value) BETWEEN 1 AND 512),
  sort_order integer NOT NULL,
  PRIMARY KEY(tenant_id,object_api,field_api,value),
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_field_picklist_values_order
  ON md_field_picklist_values(tenant_id,object_api,field_api,sort_order);
