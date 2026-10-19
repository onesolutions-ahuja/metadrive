CREATE TABLE IF NOT EXISTS md_field_type_migrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES md_tenants(id) ON DELETE CASCADE,
  object_api text NOT NULL,
  field_api text NOT NULL,
  actor_user_id uuid,
  from_data_type text NOT NULL,
  to_data_type text NOT NULL,
  from_max_length integer,
  from_precision integer,
  from_scale integer,
  from_required boolean NOT NULL,
  from_unique boolean NOT NULL,
  from_external_id boolean NOT NULL,
  from_case_sensitive boolean NOT NULL,
  from_default_value text,
  to_max_length integer,
  to_precision integer,
  to_scale integer,
  to_required boolean NOT NULL,
  to_unique boolean NOT NULL,
  to_external_id boolean NOT NULL,
  to_case_sensitive boolean NOT NULL,
  to_default_value text,
  status text NOT NULL DEFAULT 'applied' CHECK(status IN ('applied','rolled_back')),
  records_migrated integer NOT NULL DEFAULT 0 CHECK(records_migrated>=0),
  created_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz,
  UNIQUE(tenant_id,id),
  FOREIGN KEY(tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id),
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_field_type_migrations_history
  ON md_field_type_migrations(tenant_id,object_api,field_api,created_at DESC);
CREATE TABLE IF NOT EXISTS md_field_type_migration_values (
  tenant_id uuid NOT NULL,
  migration_id uuid NOT NULL,
  record_id uuid NOT NULL,
  object_api text NOT NULL,
  before_value_text text,
  before_value_number numeric,
  before_value_boolean boolean,
  before_value_date date,
  before_value_datetime timestamptz,
  before_is_unique boolean NOT NULL,
  before_case_sensitive boolean NOT NULL,
  after_value_text text,
  after_value_number numeric,
  after_value_boolean boolean,
  after_value_date date,
  after_value_datetime timestamptz,
  PRIMARY KEY(tenant_id,migration_id,record_id),
  FOREIGN KEY(tenant_id,migration_id)
    REFERENCES md_field_type_migrations(tenant_id,id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,record_id,object_api)
    REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE
);
