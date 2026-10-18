-- Read-only, tenant-aware audit of legacy record ownership and Record Type references.
-- Intentionally does not guess owners, rewrite records, or validate the NOT VALID FK.
SELECT tenant_id,object_api,
 count(*) FILTER (WHERE owner_id IS NULL) AS missing_owner_count,
 count(*) FILTER (WHERE record_type_id IS NULL) AS missing_record_type_count,
 count(*) FILTER (
   WHERE record_type_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM md_object_record_types t
     WHERE t.tenant_id=r.tenant_id AND t.object_api=r.object_api
       AND t.record_type_id=r.record_type_id
   )
 ) AS invalid_record_type_count
FROM md_records r
GROUP BY tenant_id,object_api
HAVING count(*) FILTER (WHERE owner_id IS NULL OR record_type_id IS NULL
  OR (record_type_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM md_object_record_types t
    WHERE t.tenant_id=r.tenant_id AND t.object_api=r.object_api
      AND t.record_type_id=r.record_type_id
  ))) > 0
ORDER BY tenant_id,object_api;
