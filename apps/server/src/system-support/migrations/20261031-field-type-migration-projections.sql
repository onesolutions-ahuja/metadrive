ALTER TABLE md_field_type_migration_values
  ADD COLUMN IF NOT EXISTS before_value_exists boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS after_value_exists boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS before_snapshot_encrypted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS before_reference_record_id uuid,
  ADD COLUMN IF NOT EXISTS before_geo_latitude double precision,
  ADD COLUMN IF NOT EXISTS before_geo_longitude double precision,
  ADD COLUMN IF NOT EXISTS before_address_street text,
  ADD COLUMN IF NOT EXISTS before_address_city text,
  ADD COLUMN IF NOT EXISTS before_address_state text,
  ADD COLUMN IF NOT EXISTS before_address_postal_code text,
  ADD COLUMN IF NOT EXISTS before_address_country text,
  ADD COLUMN IF NOT EXISTS after_reference_record_id uuid,
  ADD COLUMN IF NOT EXISTS after_geo_latitude double precision,
  ADD COLUMN IF NOT EXISTS after_geo_longitude double precision,
  ADD COLUMN IF NOT EXISTS after_address_street text,
  ADD COLUMN IF NOT EXISTS after_address_city text,
  ADD COLUMN IF NOT EXISTS after_address_state text,
  ADD COLUMN IF NOT EXISTS after_address_postal_code text,
  ADD COLUMN IF NOT EXISTS after_address_country text;

CREATE TABLE IF NOT EXISTS md_field_type_migration_config (
  tenant_id uuid NOT NULL,
  migration_id uuid NOT NULL,
  side text NOT NULL CHECK(side IN ('from','to')),
  related_object text,
  global_value_set_api text,
  controller_field_api text,
  relationship_type text,
  relationship_name text,
  child_relationship_name text,
  delete_behavior text,
  allow_reparenting boolean NOT NULL DEFAULT false,
  picklist_restricted boolean NOT NULL DEFAULT true,
  auto_number_format text,
  formula_expression text,
  formula_return_type text,
  rollup_child_object text,
  rollup_relationship_field text,
  rollup_operation text,
  rollup_source_field text,
  rollup_filter_logic text,
  PRIMARY KEY(tenant_id,migration_id,side),
  FOREIGN KEY(tenant_id,migration_id)
    REFERENCES md_field_type_migrations(tenant_id,id) ON DELETE CASCADE
);

ALTER TABLE md_field_type_migration_config
  ADD COLUMN IF NOT EXISTS auto_number_counter_exists boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_number_next_value bigint;

CREATE TABLE IF NOT EXISTS md_field_type_migration_picklist_values (
  tenant_id uuid NOT NULL,
  migration_id uuid NOT NULL,
  side text NOT NULL CHECK(side IN ('from','to')),
  value text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY(tenant_id,migration_id,side,value),
  FOREIGN KEY(tenant_id,migration_id,side)
    REFERENCES md_field_type_migration_config(tenant_id,migration_id,side) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS md_field_type_migration_rollup_filters (
  tenant_id uuid NOT NULL,
  migration_id uuid NOT NULL,
  side text NOT NULL CHECK(side IN ('from','to')),
  filter_field_api text NOT NULL,
  operator text NOT NULL,
  value_text text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY(tenant_id,migration_id,side,sort_order),
  FOREIGN KEY(tenant_id,migration_id,side)
    REFERENCES md_field_type_migration_config(tenant_id,migration_id,side) ON DELETE CASCADE
);
