-- Stage-only normalized component property storage. No JSONB columns.
-- Does not alter the existing source tables; live cutover requires a separate
-- verified dual-read/write migration with full rollback and RBAC coverage.
CREATE TABLE IF NOT EXISTS metadrive_component_definitions_sql (
  tenant_id TEXT NOT NULL,
  component_api_name TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  publication_status TEXT NOT NULL CHECK (publication_status IN ('Draft','Published')),
  version INTEGER NOT NULL CHECK (version > 0),
  PRIMARY KEY (tenant_id,component_api_name)
);
CREATE TABLE IF NOT EXISTS metadrive_component_property_definitions_sql (
  tenant_id TEXT NOT NULL,
  component_api_name TEXT NOT NULL,
  property_key TEXT NOT NULL,
  label TEXT NOT NULL,
  property_type TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_bindable BOOLEAN NOT NULL DEFAULT false,
  default_text TEXT,
  default_number DOUBLE PRECISION,
  default_boolean BOOLEAN,
  PRIMARY KEY (tenant_id,component_api_name,property_key),
  FOREIGN KEY (tenant_id,component_api_name)
    REFERENCES metadrive_component_definitions_sql(tenant_id,component_api_name)
    ON DELETE CASCADE,
  CHECK (num_nonnulls(default_text,default_number,default_boolean)<=1)
);
CREATE TABLE IF NOT EXISTS metadrive_page_component_instances_sql (
  tenant_id TEXT NOT NULL,
  page_api_name TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  component_api_name TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'main',
  position INTEGER NOT NULL CHECK (position >= 0),
  visible BOOLEAN NOT NULL DEFAULT true,
  width DOUBLE PRECISION,
  height DOUBLE PRECISION,
  x DOUBLE PRECISION,
  y DOUBLE PRECISION,
  PRIMARY KEY (tenant_id,page_api_name,instance_id),
  UNIQUE (tenant_id,page_api_name,position),
  FOREIGN KEY (tenant_id,component_api_name)
    REFERENCES metadrive_component_definitions_sql(tenant_id,component_api_name)
);
CREATE TABLE IF NOT EXISTS metadrive_component_property_values_sql (
  tenant_id TEXT NOT NULL,
  page_api_name TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  property_key TEXT NOT NULL,
  value_text TEXT,
  value_number DOUBLE PRECISION,
  value_boolean BOOLEAN,
  -- Bindings are references, not values serialized as JSON.
  binding_path TEXT,
  PRIMARY KEY (tenant_id,page_api_name,instance_id,property_key),
  FOREIGN KEY (tenant_id,page_api_name,instance_id)
    REFERENCES metadrive_page_component_instances_sql(tenant_id,page_api_name,instance_id)
    ON DELETE CASCADE,
  CHECK (num_nonnulls(value_text,value_number,value_boolean,binding_path)=1)
);
CREATE INDEX IF NOT EXISTS metadrive_component_instances_lookup_sql
  ON metadrive_page_component_instances_sql(tenant_id,component_api_name);
-- E.g. SELECT width,height FROM metadrive_page_component_instances_sql
-- WHERE tenant_id=$1 AND page_api_name=$2 AND instance_id=$3;
-- Complex nested Flow/Action configurations are intentionally NOT flattened
-- here: a separate typed relational design is required before safe cutover.
