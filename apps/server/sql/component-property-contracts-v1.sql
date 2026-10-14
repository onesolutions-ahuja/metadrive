-- Additive relational component property contracts. Never changes the legacy runtime.
-- This schema extends the existing md_v4 component/version registry; activation is a separate gated cutover.
CREATE TABLE IF NOT EXISTS md_v4_component_property_definitions (
  component_id UUID NOT NULL,
  version INTEGER NOT NULL,
  property_key TEXT NOT NULL CHECK(property_key ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  label TEXT NOT NULL,
  property_kind TEXT NOT NULL CHECK(property_kind IN ('TEXT','NUMBER','BOOLEAN','COLOR','IMAGE','SELECT','OBJECT_FIELD','FLOW','CURRENCY')),
  default_text TEXT,
  default_number NUMERIC,
  default_boolean BOOLEAN,
  required BOOLEAN NOT NULL DEFAULT FALSE,
  is_bindable BOOLEAN NOT NULL DEFAULT FALSE,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (component_id,version,property_key),
  FOREIGN KEY (component_id,version) REFERENCES md_v4_component_versions(component_id,version) ON DELETE RESTRICT,
  CHECK (
    ((property_kind IN ('NUMBER','CURRENCY')) AND default_text IS NULL AND default_boolean IS NULL)
    OR ((property_kind = 'BOOLEAN') AND default_text IS NULL AND default_number IS NULL)
    OR ((property_kind NOT IN ('NUMBER','CURRENCY','BOOLEAN')) AND default_number IS NULL AND default_boolean IS NULL)
  )
);
CREATE INDEX IF NOT EXISTS md_v4_component_property_order_idx
  ON md_v4_component_property_definitions(component_id,version,display_order);
CREATE TABLE IF NOT EXISTS md_v4_component_property_choices (
  component_id UUID NOT NULL,
  version INTEGER NOT NULL,
  property_key TEXT NOT NULL,
  choice_key TEXT NOT NULL,
  label TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (component_id,version,property_key,choice_key),
  FOREIGN KEY (component_id,version,property_key)
    REFERENCES md_v4_component_property_definitions(component_id,version,property_key) ON DELETE RESTRICT
);
-- An app-specific property override does not modify the reusable definition.
-- Each override is scoped to the tenant, app, page and placement.
CREATE TABLE IF NOT EXISTS md_v4_component_instance_property_values (
  tenant_id TEXT NOT NULL REFERENCES metadrive_rel_tenants(tenant_id) ON DELETE RESTRICT,
  app_api_name TEXT NOT NULL,
  page_api_name TEXT NOT NULL,
  placement_id TEXT NOT NULL,
  component_id UUID NOT NULL,
  version INTEGER NOT NULL,
  property_key TEXT NOT NULL,
  value_text TEXT,
  value_number NUMERIC,
  value_boolean BOOLEAN,
  binding_object_api_name TEXT,
  binding_field_api_name TEXT,
  PRIMARY KEY(tenant_id,app_api_name,page_api_name,placement_id,property_key),
  FOREIGN KEY(component_id,version,property_key)
    REFERENCES md_v4_component_property_definitions(component_id,version,property_key) ON DELETE RESTRICT,
  CHECK (
    num_nonnulls(value_text,value_number,value_boolean) <= 1
    AND (binding_field_api_name IS NULL OR binding_object_api_name IS NOT NULL)
    AND ((binding_object_api_name IS NULL AND binding_field_api_name IS NULL)
      OR num_nonnulls(value_text,value_number,value_boolean) = 0)
  )
);
CREATE INDEX IF NOT EXISTS md_v4_instance_component_idx ON md_v4_component_instance_property_values(component_id,version);
-- Action -> Flow binding is stored relationally and scoped to the instance.
CREATE TABLE IF NOT EXISTS md_v4_component_action_flows (
  tenant_id TEXT NOT NULL REFERENCES metadrive_rel_tenants(tenant_id) ON DELETE RESTRICT,
  app_api_name TEXT NOT NULL,
  page_api_name TEXT NOT NULL,
  placement_id TEXT NOT NULL,
  action_key TEXT NOT NULL,
  flow_api_name TEXT NOT NULL,
  PRIMARY KEY(tenant_id,app_api_name,page_api_name,placement_id,action_key)
);
-- Guard against writing another tenant's component definitions as app overrides.
CREATE OR REPLACE FUNCTION md_v4_guard_component_instance_tenant() RETURNS trigger
LANGUAGE plpgsql AS $md_component_guard$
DECLARE owner_id TEXT;
BEGIN
  SELECT owner_tenant_id INTO owner_id FROM md_v4_components WHERE component_id=NEW.component_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown component'; END IF;
  IF owner_id IS NOT NULL AND owner_id <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant component property override rejected';
  END IF;
  RETURN NEW;
END $md_component_guard$;
DROP TRIGGER IF EXISTS md_v4_component_instance_tenant_guard ON md_v4_component_instance_property_values;
CREATE TRIGGER md_v4_component_instance_tenant_guard
BEFORE INSERT OR UPDATE ON md_v4_component_instance_property_values
FOR EACH ROW EXECUTE FUNCTION md_v4_guard_component_instance_tenant();
-- No deletes, backfills, grants or live cutover in this schema addition.

-- Reconcile property-definition existence and tenant ownership for each placement.
CREATE OR REPLACE FUNCTION md_v4_guard_component_property_binding() RETURNS trigger
LANGUAGE plpgsql AS $md_component_binding$
DECLARE bindable BOOLEAN;
BEGIN
  SELECT is_bindable INTO bindable FROM md_v4_component_property_definitions
  WHERE component_id=NEW.component_id AND version=NEW.version AND property_key=NEW.property_key;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown component property'; END IF;
  IF NEW.binding_object_api_name IS NOT NULL AND NOT bindable
    THEN RAISE EXCEPTION 'Component property is not bindable'; END IF;
  RETURN NEW;
END $md_component_binding$;
DROP TRIGGER IF EXISTS md_v4_component_binding_guard ON md_v4_component_instance_property_values;
CREATE TRIGGER md_v4_component_binding_guard BEFORE INSERT OR UPDATE
ON md_v4_component_instance_property_values FOR EACH ROW
EXECUTE FUNCTION md_v4_guard_component_property_binding();
