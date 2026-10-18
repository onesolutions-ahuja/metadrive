-- Additive tenant lifecycle fields. Preserve tenants, users, domains and business records.
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS retention_until timestamptz;
ALTER TABLE md_tenants ADD COLUMN IF NOT EXISTS legal_hold boolean NOT NULL DEFAULT false;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='md_tenants_status_check' AND conrelid='md_tenants'::regclass) THEN
  ALTER TABLE md_tenants ADD CONSTRAINT md_tenants_status_check CHECK(status IN ('ACTIVE','SUSPENDED','ARCHIVED'));
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS md_tenant_lifecycle_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor_tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 actor_user_id uuid NOT NULL,
 target_tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 operation text NOT NULL,
 previous_status text NOT NULL,
 new_status text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (actor_tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_tenant_lifecycle_audit_target ON md_tenant_lifecycle_audit(target_tenant_id,created_at DESC);

ALTER TABLE md_users ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS md_tenant_provisioning_requests (
 actor_tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 actor_user_id uuid NOT NULL,
 request_key uuid NOT NULL,
 request_digest text NOT NULL,
 target_tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (actor_tenant_id,actor_user_id,request_key),
 FOREIGN KEY (actor_tenant_id,actor_user_id) REFERENCES md_users(tenant_id,id)
);
