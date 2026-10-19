CREATE TABLE IF NOT EXISTS md_global_value_sets (
  tenant_id uuid NOT NULL REFERENCES md_tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]{0,79}$'),
  label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '' CHECK(length(description) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id),
  UNIQUE(tenant_id,api_name)
);

CREATE TABLE IF NOT EXISTS md_global_value_set_values (
  tenant_id uuid NOT NULL,
  value_set_id uuid NOT NULL,
  value text NOT NULL CHECK(length(btrim(value)) BETWEEN 1 AND 512),
  label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 120),
  sort_order integer NOT NULL CHECK(sort_order >= 0),
  active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(tenant_id,value_set_id,value),
  FOREIGN KEY(tenant_id,value_set_id)
    REFERENCES md_global_value_sets(tenant_id,id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS md_global_value_set_values_unique_ci
  ON md_global_value_set_values(tenant_id,value_set_id,lower(value));
CREATE INDEX IF NOT EXISTS md_global_value_set_values_order
  ON md_global_value_set_values(tenant_id,value_set_id,sort_order,value);

CREATE TABLE IF NOT EXISTS md_global_value_set_audit (
  tenant_id uuid NOT NULL REFERENCES md_tenants(id) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  value_set_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN ('create','update','delete')),
  api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]{0,79}$'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY(tenant_id,actor_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_global_value_set_audit_lookup
  ON md_global_value_set_audit(tenant_id,value_set_id,occurred_at DESC);
