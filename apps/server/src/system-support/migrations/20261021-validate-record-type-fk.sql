-- Once legacy references have been reconciled, validate the existing tenant/object FK.
-- This does not change any customer record. Invalid legacy references cause a safe failure.
DO $$
BEGIN
 IF EXISTS (
   SELECT 1 FROM md_records r
   WHERE r.record_type_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM md_object_record_types t
     WHERE t.tenant_id=r.tenant_id AND t.object_api=r.object_api
       AND t.record_type_id=r.record_type_id
   )
 ) THEN
   RAISE EXCEPTION 'Legacy record type references require correction before FK validation';
 END IF;
END $$;
ALTER TABLE md_records VALIDATE CONSTRAINT md_records_record_type_tenant_object_fk;
