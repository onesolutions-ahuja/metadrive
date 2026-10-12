-- MetaDrive relational staging schema, revision 1.
-- Additive only: never touches metadrive_platform_state or existing production tables.
-- SQL object names are fixed. Tenant object/field names remain metadata, never DDL identifiers.
CREATE TABLE IF NOT EXISTS metadrive_rel_migrations (
  revision SMALLINT PRIMARY KEY CHECK (revision = 1),
  source_sha256 CHAR(64) NOT NULL,
  migrated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS metadrive_rel_tenants (
  tenant_id TEXT PRIMARY KEY CHECK (length(tenant_id) > 0)
);
CREATE TABLE IF NOT EXISTS metadrive_rel_objects (
  tenant_id TEXT NOT NULL REFERENCES metadrive_rel_tenants(tenant_id),
  object_api_name TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  payload JSONB NOT NULL,
  PRIMARY KEY (tenant_id, object_api_name),
  UNIQUE (tenant_id, position)
);
CREATE TABLE IF NOT EXISTS metadrive_rel_tenant_collections (
  tenant_id TEXT NOT NULL REFERENCES metadrive_rel_tenants(tenant_id),
  collection_name TEXT NOT NULL,
  PRIMARY KEY (tenant_id, collection_name)
);
CREATE TABLE IF NOT EXISTS metadrive_rel_tenant_collection_items (
  tenant_id TEXT NOT NULL,
  collection_name TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  payload JSONB NOT NULL,
  PRIMARY KEY (tenant_id, collection_name, position),
  FOREIGN KEY (tenant_id, collection_name) REFERENCES metadrive_rel_tenant_collections(tenant_id, collection_name)
);
CREATE TABLE IF NOT EXISTS metadrive_rel_tenant_settings (
  tenant_id TEXT NOT NULL REFERENCES metadrive_rel_tenants(tenant_id),
  setting_name TEXT NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (tenant_id, setting_name)
);
CREATE TABLE IF NOT EXISTS metadrive_rel_record_buckets (
  tenant_id TEXT NOT NULL REFERENCES metadrive_rel_tenants(tenant_id),
  object_api_name TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  PRIMARY KEY (tenant_id, object_api_name),
  UNIQUE (tenant_id, position)
);
CREATE TABLE IF NOT EXISTS metadrive_rel_records (
  tenant_id TEXT NOT NULL,
  object_api_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  payload JSONB NOT NULL,
  PRIMARY KEY (tenant_id, object_api_name, record_id),
  UNIQUE (tenant_id, object_api_name, position),
  FOREIGN KEY (tenant_id, object_api_name) REFERENCES metadrive_rel_record_buckets(tenant_id, object_api_name)
);
CREATE INDEX IF NOT EXISTS metadrive_rel_record_values_gin ON metadrive_rel_records USING GIN (payload jsonb_path_ops);
CREATE TABLE IF NOT EXISTS metadrive_rel_users (
  user_id TEXT PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
  tenant_id TEXT NOT NULL REFERENCES metadrive_rel_tenants(tenant_id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  permission_set_ids JSONB NOT NULL,
  permission_set_group_ids JSONB NOT NULL,
  disabled BOOLEAN NOT NULL,
  created_at TEXT NOT NULL,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS metadrive_rel_users_email_unique ON metadrive_rel_users (lower(btrim(email)));
CREATE TABLE IF NOT EXISTS metadrive_rel_refresh_sessions (
  token_hash TEXT PRIMARY KEY,
  position INTEGER NOT NULL UNIQUE CHECK (position >= 0),
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  expires_at DOUBLE PRECISION NOT NULL,
  used_at DOUBLE PRECISION,
  revoked_at DOUBLE PRECISION,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb
);
-- A refresh token must reference a user *within the same tenant*.
-- Safe for existing migrated databases: idempotent upgrade; PostgreSQL validates
-- all existing rows before enabling the constraint. Never delete invalid rows.
CREATE UNIQUE INDEX IF NOT EXISTS metadrive_rel_users_tenant_user_uidx
  ON metadrive_rel_users(tenant_id,user_id);
DO $md_03_4$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid='metadrive_rel_refresh_sessions'::regclass
      AND conname='metadrive_rel_session_tenant_user_fk') THEN
    ALTER TABLE metadrive_rel_refresh_sessions
      ADD CONSTRAINT metadrive_rel_session_tenant_user_fk
      FOREIGN KEY (tenant_id,user_id) REFERENCES metadrive_rel_users(tenant_id,user_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $md_03_4$;
CREATE INDEX IF NOT EXISTS metadrive_rel_sessions_by_user ON metadrive_rel_refresh_sessions(user_id);
CREATE TABLE IF NOT EXISTS metadrive_rel_revoked_tokens (
  token_hash TEXT PRIMARY KEY,
  expires_at DOUBLE PRECISION NOT NULL
);
CREATE TABLE IF NOT EXISTS metadrive_rel_library_components (
  position INTEGER PRIMARY KEY CHECK (position >= 0),
  payload JSONB NOT NULL
);
-- Platform-scoped authorisation policy and audit metadata, kept separate from tenants.
CREATE TABLE IF NOT EXISTS metadrive_rel_platform_settings (
  setting_name TEXT PRIMARY KEY CHECK (setting_name IN ('platformPolicies','platformPolicyAudit','tenantRegistry','tenantManagementAudit')),
  payload JSONB NOT NULL
);
-- Idempotent upgrade for databases provisioned before MD-03.1.
-- Run this DDL with deployment migrations before tenant-management writes.
ALTER TABLE metadrive_rel_platform_settings
  DROP CONSTRAINT IF EXISTS metadrive_rel_platform_settings_setting_name_check;
ALTER TABLE metadrive_rel_platform_settings
  ADD CONSTRAINT metadrive_rel_platform_settings_setting_name_check
  CHECK (setting_name IN ('platformPolicies','platformPolicyAudit','tenantRegistry','tenantManagementAudit'));
CREATE INDEX IF NOT EXISTS metadrive_rel_collection_api_name_idx ON metadrive_rel_tenant_collection_items (tenant_id, collection_name, (payload->>'apiName'));

-- Runtime revision row used for fail-closed optimistic concurrency and state verification.
CREATE TABLE IF NOT EXISTS metadrive_rel_runtime (
  id SMALLINT PRIMARY KEY CHECK (id=1),
  version BIGINT NOT NULL CHECK (version>=0),
  state_sha256 CHAR(64) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
