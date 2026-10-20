-- P0 declarative rules: SQL source of truth, scoped to one tenant/object.
CREATE TABLE IF NOT EXISTS md_validation_rules (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  rule_api text NOT NULL CHECK(rule_api ~ '^[A-Za-z][A-Za-z0-9_]{0,79}$'),
  label text NOT NULL CHECK(length(label) BETWEEN 1 AND 160),
  expression text NOT NULL CHECK(length(expression) BETWEEN 1 AND 4000),
  error_message text NOT NULL CHECK(length(error_message) BETWEEN 1 AND 1000),
  error_field text,
  operations text NOT NULL DEFAULT 'Both' CHECK(operations IN ('Both','Create','Update')),
  active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,object_api,rule_api),
  FOREIGN KEY(tenant_id,object_api)
    REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,object_api,error_field)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name)
);
CREATE INDEX IF NOT EXISTS md_validation_rules_active
  ON md_validation_rules(tenant_id,object_api,sort_order,rule_api) WHERE active;
CREATE TABLE IF NOT EXISTS md_field_default_formulas (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  field_api text NOT NULL,
  expression text NOT NULL CHECK(length(expression) BETWEEN 1 AND 4000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,object_api,field_api),
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE
);
