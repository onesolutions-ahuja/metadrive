ALTER TABLE md_records ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='md_records_owner_same_tenant_fk')
 THEN ALTER TABLE md_records ADD CONSTRAINT md_records_owner_same_tenant_fk
 FOREIGN KEY(tenant_id,owner_id) REFERENCES md_users(tenant_id,id); END IF;
END $$;
CREATE TABLE IF NOT EXISTS md_record_change_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 object_api text NOT NULL,
 record_id uuid NOT NULL,
 changed_by uuid NOT NULL,
 change_type text NOT NULL CHECK(change_type IN ('update','owner')),
 previous_data jsonb NOT NULL DEFAULT '{}'::jsonb,
 next_data jsonb NOT NULL DEFAULT '{}'::jsonb,
 changed_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,record_id,object_api) REFERENCES md_records(tenant_id,id,object_api),
 FOREIGN KEY(tenant_id,changed_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_record_change_history_lookup ON md_record_change_history(tenant_id,object_api,record_id,changed_at DESC);
