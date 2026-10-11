-- Additive relational registry for a future, typed-object shadow migration.
-- DO NOT apply to production until fresh backup and isolated restore are verified.
-- Object and field IDs remain immutable across label or API-name changes.
-- Operational record values will be written into typed md_obj_<UUID> tables,
-- never JSONB blobs. This file does not migrate, delete or rewrite live data.
CREATE TABLE IF NOT EXISTS md_v2_object_registry (
  object_id UUID PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES metadrive_rel_tenants(tenant_id),
  api_name TEXT NOT NULL,
  object_label TEXT NOT NULL,
  physical_table TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (tenant_id,api_name)
);
CREATE TABLE IF NOT EXISTS md_v2_field_registry (
  field_id UUID PRIMARY KEY,
  object_id UUID NOT NULL REFERENCES md_v2_object_registry(object_id) ON DELETE RESTRICT,
  api_name TEXT NOT NULL,
  field_label TEXT NOT NULL,
  source_data_type TEXT NOT NULL,
  physical_column TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (object_id,api_name),
  UNIQUE (object_id,physical_column)
);
CREATE TABLE IF NOT EXISTS md_v2_relationship_registry (
  relationship_id UUID PRIMARY KEY,
  field_id UUID NOT NULL UNIQUE REFERENCES md_v2_field_registry(field_id) ON DELETE RESTRICT,
  target_object_id UUID NOT NULL REFERENCES md_v2_object_registry(object_id) ON DELETE RESTRICT,
  on_delete TEXT NOT NULL DEFAULT 'RESTRICT' CHECK (on_delete IN ('RESTRICT','SET NULL','CASCADE'))
);
