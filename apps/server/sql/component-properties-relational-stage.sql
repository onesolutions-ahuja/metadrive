-- Stage-only hybrid component metadata: fixed common columns plus JSONB extras.
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
  surface TEXT NOT NULL CHECK (surface IN ('pages','dashboards','flows')),
  page_api_name TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  component_api_name TEXT NOT NULL,
  region TEXT NOT NULL DEFAULT 'main',
  position INTEGER NOT NULL CHECK (position >= 0),
  visible BOOLEAN NOT NULL DEFAULT true,
  width TEXT,
  height TEXT,
  x TEXT,
  y TEXT,
  background_color TEXT,
  text_color TEXT,
  font_size TEXT,
  padding TEXT,
  border_radius TEXT,
  -- Only specialised and nested settings go here (Flows, actions, bindings).
  additional_properties JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(additional_properties)='object'),
  CHECK (NOT (additional_properties ?| ARRAY[
    'width','height','x','y','backgroundColor','textColor',
    'fontSize','padding','borderRadius','visible','region','position'
  ])),
  PRIMARY KEY (tenant_id,surface,page_api_name,instance_id),
  UNIQUE (tenant_id,surface,page_api_name,position),
  FOREIGN KEY (tenant_id,component_api_name)
    REFERENCES metadrive_component_definitions_sql(tenant_id,component_api_name)
);
CREATE INDEX IF NOT EXISTS metadrive_component_instances_lookup_sql
  ON metadrive_page_component_instances_sql(tenant_id,component_api_name);
-- E.g. SELECT width,height,additional_properties FROM metadrive_page_component_instances_sql
-- WHERE tenant_id=$1 AND page_api_name=$2 AND instance_id=$3;
-- Runtime must merge additional_properties with fixed columns through one shared
-- metadata adapter; reserved common keys cannot be duplicated in JSONB.
-- No production cutover or data overwrite occurs in this staging SQL.
