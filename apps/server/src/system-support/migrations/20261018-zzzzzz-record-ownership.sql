-- Universal record ownership is tenant-bound and independent of business Objects.
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='md_records_owner_tenant_fkey') THEN
  ALTER TABLE md_records ADD CONSTRAINT md_records_owner_tenant_fkey
   FOREIGN KEY(tenant_id,owner_id) REFERENCES md_users(tenant_id,id);
 END IF;
END $$;
CREATE INDEX IF NOT EXISTS md_records_owner_lookup ON md_records(tenant_id,owner_id,object_api);
