-- MD-07 SQL-only component registry shadow model (additive; no production cutover).
-- Explicitly no JSON / JSONB columns. A migration operator must first
-- verify restored backups and stage dual-write reconciliation before activation.
CREATE TABLE IF NOT EXISTS md_v4_components (
  component_id UUID PRIMARY KEY,
  api_name TEXT NOT NULL CHECK (api_name ~ '^[A-Za-z][A-Za-z0-9_]*
  owner_tenant_id TEXT REFERENCES metadrive_rel_tenants(tenant_id) ON DELETE RESTRICT,
  registry_scope TEXT NOT NULL CHECK (registry_scope IN ('PLATFORM','TENANT')),
  published_version INTEGER NOT NULL DEFAULT 0 CHECK (published_version >= 0),
  draft_version INTEGER CHECK (draft_version > 0),
  deleted_at TIMESTAMPTZ,
  CHECK ((registry_scope = 'PLATFORM' AND owner_tenant_id IS NULL) OR (registry_scope = 'TENANT' AND owner_tenant_id IS NOT NULL)),
  UNIQUE(component_id,registry_scope)
);
-- Same API name is valid in different tenant registries. PLATFORM names
-- remain globally unique. Install scoped indexes before removing the
-- old global unique constraint so migrations cannot permit duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS md_v4_component_platform_name_unique
  ON md_v4_components (api_name) WHERE registry_scope = 'PLATFORM';
CREATE UNIQUE INDEX IF NOT EXISTS md_v4_component_tenant_name_unique
  ON md_v4_components (owner_tenant_id, api_name) WHERE registry_scope = 'TENANT';
ALTER TABLE md_v4_components DROP CONSTRAINT IF EXISTS md_v4_components_api_name_key;

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
),
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

-- Trusted PLATFORM developer names cannot be shadowed by TENANT components.
-- Serialize same-name inserts/renames to close the concurrent-insert race
-- between otherwise independent partial unique indexes.
CREATE OR REPLACE FUNCTION md_v4_enforce_platform_name_reservation() RETURNS trigger
LANGUAGE plpgsql AS $md07name$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('md_v4_component_name'),hashtext(NEW.api_name));
  IF EXISTS (
    SELECT 1 FROM md_v4_components existing
    WHERE existing.api_name = NEW.api_name
      AND existing.registry_scope <> NEW.registry_scope
      AND existing.component_id <> NEW.component_id
  ) THEN
    RAISE EXCEPTION 'Platform component name is reserved across tenant registries';
  END IF;
  RETURN NEW;
END
$md07name$;
DROP TRIGGER IF EXISTS md_v4_platform_name_reservation ON md_v4_components;
CREATE TRIGGER md_v4_platform_name_reservation BEFORE INSERT OR UPDATE OF api_name,registry_scope,owner_tenant_id
ON md_v4_components FOR EACH ROW EXECUTE FUNCTION md_v4_enforce_platform_name_reservation();
DO $md07migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM md_v4_components a JOIN md_v4_components b
      ON a.api_name=b.api_name
    WHERE a.registry_scope='PLATFORM' AND b.registry_scope='TENANT'
  ) THEN
    RAISE EXCEPTION 'Cannot activate tenant-local component names: existing platform name collision';
  END IF;
END
$md07migration$;
