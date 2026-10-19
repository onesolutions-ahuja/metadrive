-- Enforce tenant/object-scoped Record Type references for new writes.
-- NOT VALID preserves existing business rows until a separately audited validation.
-- PostgreSQL still enforces this foreign key for new inserts and changed references.
DO $$
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM pg_constraint
   WHERE conname='md_records_record_type_tenant_object_fk'
     AND conrelid='md_records'::regclass
 ) THEN
   ALTER TABLE md_records
     ADD CONSTRAINT md_records_record_type_tenant_object_fk
     FOREIGN KEY (tenant_id,object_api,record_type_id)
     REFERENCES md_object_record_types(tenant_id,object_api,record_type_id)
     NOT VALID;
 END IF;
END $$;
