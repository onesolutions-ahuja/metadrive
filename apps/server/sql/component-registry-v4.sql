-- MD-07 SQL-only component registry shadow model (additive; no production cutover).
-- Explicitly no JSON / JSONB columns. A migration operator must first
-- verify restored backups and stage dual-write reconciliation before activation.
CREATE TABLE IF NOT EXISTS md_v4_components (
  component_id UUID PRIMARY KEY,
  api_name TEXT NOT NULL UNIQUE CHECK (api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  owner_tenant_id TEXT REFERENCES metadrive_rel_tenants(tenant_id) ON DELETE RESTRICT,
  registry_scope TEXT NOT NULL CHECK (registry_scope IN ('PLATFORM','TENANT')),
  published_version INTEGER NOT NULL DEFAULT 0 CHECK (published_version >= 0),
  draft_version INTEGER CHECK (draft_version > 0),
  deleted_at TIMESTAMPTZ,
  CHECK ((registry_scope = 'PLATFORM' AND owner_tenant_id IS NULL) OR (registry_scope = 'TENANT' AND owner_tenant_id IS NOT NULL)),
  UNIQUE(component_id,registry_scope)
);
CREATE TABLE IF NOT EXISTS md_v4_component_versions (
  component_id UUID NOT NULL REFERENCES md_v4_components(component_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(version>0),
  label TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  source_jsx TEXT NOT NULL, source_css TEXT NOT NULL,
  compiled_js TEXT NOT NULL, scoped_css TEXT NOT NULL,
  width_default INTEGER NOT NULL, height_default INTEGER NOT NULL,
  width_min INTEGER NOT NULL, height_min INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('DRAFT','PUBLISHED','ARCHIVED')),
  author_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(component_id,version)
);
CREATE TABLE IF NOT EXISTS md_v4_component_surfaces (
  component_id UUID NOT NULL,
  version INTEGER NOT NULL,
  surface TEXT NOT NULL CHECK(surface IN ('page','dashboard','flow')),
  PRIMARY KEY(component_id,version,surface),
  FOREIGN KEY(component_id,version) REFERENCES md_v4_component_versions(component_id,version) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS md_v4_component_dependencies (
  tenant_id TEXT NOT NULL REFERENCES metadrive_rel_tenants(tenant_id),
  component_id UUID NOT NULL REFERENCES md_v4_components(component_id) ON DELETE RESTRICT,
  surface TEXT NOT NULL CHECK(surface IN ('page','dashboard','flow')),
  owner_api_name TEXT NOT NULL,
  placement_id TEXT NOT NULL,
  PRIMARY KEY(tenant_id,component_id,surface,owner_api_name,placement_id)
);
CREATE INDEX IF NOT EXISTS md_v4_component_dependency_index ON md_v4_component_dependencies(component_id,surface);
-- No grant to runtime here: activation requires migration reconciliation and separate verification.

-- Row-level tenant constraint: platform components may be referenced across tenants,
-- tenant-owned component definitions may only be placed within their owner tenant.
CREATE OR REPLACE FUNCTION md_v4_enforce_dependency_tenant() RETURNS trigger
LANGUAGE plpgsql AS $md07$
DECLARE component_owner TEXT;
BEGIN
  SELECT owner_tenant_id INTO component_owner FROM md_v4_components WHERE component_id = NEW.component_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown component reference'; END IF;
  IF component_owner IS NOT NULL AND component_owner <> NEW.tenant_id THEN
    RAISE EXCEPTION 'Cross-tenant component reference rejected';
  END IF;
  RETURN NEW;
END
$md07$;
DROP TRIGGER IF EXISTS md_v4_dependency_tenant_guard ON md_v4_component_dependencies;
CREATE TRIGGER md_v4_dependency_tenant_guard BEFORE INSERT OR UPDATE ON md_v4_component_dependencies
FOR EACH ROW EXECUTE FUNCTION md_v4_enforce_dependency_tenant();
