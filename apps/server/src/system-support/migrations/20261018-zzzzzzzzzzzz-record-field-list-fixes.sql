ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS is_unique boolean NOT NULL DEFAULT false;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS external_id boolean NOT NULL DEFAULT false;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS case_sensitive boolean NOT NULL DEFAULT false;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS help_text text;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS precision integer CHECK (precision BETWEEN 1 AND 38);
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS scale integer CHECK (scale BETWEEN 0 AND 38);
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS default_value text;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS relationship_type text;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS formula_expression text;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS formula_return_type text;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS auto_number_format text;

ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS is_unique boolean NOT NULL DEFAULT false;
ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS case_sensitive boolean NOT NULL DEFAULT false;
ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS geo_latitude double precision;
ALTER TABLE md_record_values ADD COLUMN IF NOT EXISTS geo_longitude double precision;

CREATE UNIQUE INDEX IF NOT EXISTS md_record_values_unique_ci
  ON md_record_values(tenant_id,object_api,field_api,lower(value_text))
  WHERE is_unique AND NOT case_sensitive AND value_text IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS md_record_values_unique_cs
  ON md_record_values(tenant_id,object_api,field_api,value_text)
  WHERE is_unique AND case_sensitive AND value_text IS NOT NULL;

CREATE TABLE IF NOT EXISTS md_auto_number_counters (
  tenant_id uuid NOT NULL REFERENCES md_tenants(id),
  object_api text NOT NULL,
  field_api text NOT NULL,
  next_value bigint NOT NULL DEFAULT 1 CHECK(next_value > 0),
  PRIMARY KEY(tenant_id,object_api,field_api),
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE
);
