-- Opt-in retention policy. A tenant administrator must explicitly enable
-- automatic purging; there is no platform-wide implicit destruction of data.
CREATE TABLE IF NOT EXISTS md_record_retention_settings (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),
 retention_days integer NOT NULL DEFAULT 15 CHECK(retention_days BETWEEN 1 AND 3650),
 automatic_purge_enabled boolean NOT NULL DEFAULT false,
 configured_by uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,configured_by) REFERENCES md_users(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_record_retention_audit (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 actor_id uuid NOT NULL,
 retention_days integer NOT NULL,
 automatic_purge_enabled boolean NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,actor_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_record_retention_audit_lookup
 ON md_record_retention_audit(tenant_id,changed_at DESC);
