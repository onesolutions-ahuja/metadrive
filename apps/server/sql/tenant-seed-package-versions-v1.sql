-- Agent 2: additive, tenant-scoped seeder version ledger.
-- Does not modify existing metadata, user policies, or business records.
-- Integration must write to this ledger in the SAME transaction as each
-- successful SQL metadata package application. Do not stamp it preemptively.
CREATE TABLE IF NOT EXISTS md_seed_package_versions (
  tenant_id TEXT NOT NULL REFERENCES metadrive_rel_tenants(tenant_id) ON DELETE RESTRICT,
  package_kind TEXT NOT NULL CHECK (package_kind IN ('core', 'shared', 'app')),
  package_key TEXT NOT NULL CHECK (length(trim(package_key)) BETWEEN 1 AND 160),
  package_version TEXT NOT NULL CHECK (length(trim(package_version)) BETWEEN 1 AND 80),
  definition_checksum CHAR(64) NOT NULL CHECK (definition_checksum ~ '^[a-f0-9]{64}$'),
  installed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, package_kind, package_key)
);
CREATE INDEX IF NOT EXISTS md_seed_package_versions_kind_idx
  ON md_seed_package_versions (tenant_id, package_kind, updated_at DESC);
-- Package application must use tenant-scoped UPSERT with a checksum check and
-- only update the version AFTER metadata merge has committed successfully.
-- User customizations and changed OneEngine grants must never be overwritten.
