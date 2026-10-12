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

-- Preserve distinction between an absent field and an explicitly null field.
-- All values themselves live in typed physical object columns.
CREATE TABLE IF NOT EXISTS md_v2_field_presence (
  object_id UUID NOT NULL REFERENCES md_v2_object_registry(object_id) ON DELETE RESTRICT,
  tenant_id TEXT NOT NULL REFERENCES metadrive_rel_tenants(tenant_id),
  record_id TEXT NOT NULL,
  field_id UUID NOT NULL REFERENCES md_v2_field_registry(field_id) ON DELETE RESTRICT,
  PRIMARY KEY (object_id,tenant_id,record_id,field_id)
);
-- A typed presence row must match BOTH the tenant owning the physical
-- object and a field defined by that same object. Separate single-column FKs
-- previously allowed a cross-tenant/object combination.
CREATE UNIQUE INDEX IF NOT EXISTS md_v2_object_tenant_identity_uidx
  ON md_v2_object_registry(object_id,tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS md_v2_field_object_identity_uidx
  ON md_v2_field_registry(object_id,field_id);
DO $md_03_4$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='md_v2_field_presence'::regclass
      AND conname='md_v2_presence_tenant_object_fk') THEN
    ALTER TABLE md_v2_field_presence
      ADD CONSTRAINT md_v2_presence_tenant_object_fk
      FOREIGN KEY (object_id,tenant_id) REFERENCES md_v2_object_registry(object_id,tenant_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='md_v2_field_presence'::regclass
      AND conname='md_v2_presence_object_field_fk') THEN
    ALTER TABLE md_v2_field_presence
      ADD CONSTRAINT md_v2_presence_object_field_fk
      FOREIGN KEY (object_id,field_id) REFERENCES md_v2_field_registry(object_id,field_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $md_03_4$;

CREATE TABLE IF NOT EXISTS md_v2_shadow_run (
  id SMALLINT PRIMARY KEY CHECK (id=1),
  source_sha256 CHAR(64) NOT NULL,
  object_count BIGINT NOT NULL,
  record_count BIGINT NOT NULL,
  copied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
