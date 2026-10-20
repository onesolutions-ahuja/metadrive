-- Upgrade-safe conversion of generic Flow replay snapshots to relational path/value rows.
-- No app-specific payment data or JSON runtime payload remains in SQL after migration.
CREATE TABLE IF NOT EXISTS md_flow_execution_result_values (
 tenant_id uuid NOT NULL,
 actor_id uuid NOT NULL,
 flow_api text NOT NULL,
 request_id uuid NOT NULL,
 property_path text NOT NULL CHECK(length(property_path) BETWEEN 1 AND 1024),
 value_kind text NOT NULL CHECK(value_kind IN ('string','number','boolean','null','array','object')),
 value_text text,
 PRIMARY KEY(tenant_id,actor_id,flow_api,request_id,property_path),
 FOREIGN KEY(tenant_id,actor_id,flow_api,request_id)
  REFERENCES md_flow_execution_requests(tenant_id,actor_id,flow_api,request_id)
  ON DELETE CASCADE
);

-- Upgrades from 20261115 must preserve completed responses, including nested
-- object and array values. A fresh schema does not have the legacy JSONB column.
DO $upgrade$
BEGIN
 IF EXISTS (
   SELECT 1 FROM information_schema.columns
   WHERE table_schema=current_schema()
     AND table_name='md_flow_execution_requests' AND column_name='result_payload'
 ) THEN
  EXECUTE $migrate$
   WITH RECURSIVE nodes AS (
     SELECT tenant_id,actor_id,flow_api,request_id,
       '/result'::text AS path,result_payload AS value
     FROM md_flow_execution_requests WHERE result_payload IS NOT NULL
     UNION ALL
     SELECT n.tenant_id,n.actor_id,n.flow_api,n.request_id,
       n.path || '/' || replace(replace(child.label,'~','~0'),'/','~1'),child.value
     FROM nodes n
     CROSS JOIN LATERAL (
       SELECT key AS label,value
       FROM jsonb_each(CASE WHEN jsonb_typeof(n.value)='object'
                          THEN n.value ELSE '{}'::jsonb END)
       UNION ALL
       SELECT (ordinality-1)::text AS label,value
       FROM jsonb_array_elements(CASE WHEN jsonb_typeof(n.value)='array'
                                     THEN n.value ELSE '[]'::jsonb END)
       WITH ORDINALITY
     ) child
   )
   INSERT INTO md_flow_execution_result_values
      (tenant_id,actor_id,flow_api,request_id,property_path,value_kind,value_text)
   SELECT tenant_id,actor_id,flow_api,request_id,path,jsonb_typeof(value),
     CASE WHEN jsonb_typeof(value) IN ('string','number','boolean')
       THEN value #>> '{}' ELSE NULL END
   FROM nodes
   ON CONFLICT(tenant_id,actor_id,flow_api,request_id,property_path) DO NOTHING
  $migrate$;
  -- Dropping the old JSONB source only happens after all rows are migrated
  -- successfully within the same transactional migration.
  ALTER TABLE md_flow_execution_requests DROP COLUMN result_payload;
 END IF;
END $upgrade$;
