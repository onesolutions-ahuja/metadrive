CREATE TABLE IF NOT EXISTS md_platform_event_details (
 tenant_id uuid NOT NULL,
 kind text NOT NULL DEFAULT 'platform-events' CHECK(kind='platform-events'),
 event_api_name text NOT NULL,
 description text NOT NULL DEFAULT '',
 PRIMARY KEY(tenant_id,event_api_name),
 FOREIGN KEY(tenant_id,kind,event_api_name)
  REFERENCES md_system_definitions(tenant_id,kind,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_platform_event_fields (
 tenant_id uuid NOT NULL,
 kind text NOT NULL DEFAULT 'platform-events' CHECK(kind='platform-events'),
 event_api_name text NOT NULL,
 field_api text NOT NULL,
 label text NOT NULL,
 data_type text NOT NULL CHECK(data_type IN (
  'Text(255)','Long Text Area','Number','Currency','Percent','Checkbox','Date','DateTime','Picklist')),
 required boolean NOT NULL DEFAULT false,
 picklist_restricted boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),
 PRIMARY KEY(tenant_id,event_api_name,field_api),
 FOREIGN KEY(tenant_id,kind,event_api_name)
  REFERENCES md_system_definitions(tenant_id,kind,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_platform_event_picklist_values (
 tenant_id uuid NOT NULL,
 event_api_name text NOT NULL,
 field_api text NOT NULL,
 value_text text NOT NULL,
 sort_order integer NOT NULL CHECK(sort_order>=0),
 PRIMARY KEY(tenant_id,event_api_name,field_api,value_text),
 FOREIGN KEY(tenant_id,event_api_name,field_api)
  REFERENCES md_platform_event_fields(tenant_id,event_api_name,field_api) ON DELETE CASCADE
);
DO $migration$
BEGIN
 IF EXISTS(
  SELECT 1 FROM md_system_definitions d
  WHERE d.kind='platform-events' AND (
   d.properties-'fields'-'description'<>'{}'::jsonb
   OR COALESCE(jsonb_typeof(d.properties->'fields'),'')<>'array'
   OR jsonb_array_length(CASE WHEN jsonb_typeof(d.properties->'fields')='array'
    THEN d.properties->'fields' ELSE '[]'::jsonb END) NOT BETWEEN 1 AND 100
   OR EXISTS(
    SELECT 1 FROM jsonb_array_elements(
     CASE WHEN jsonb_typeof(d.properties->'fields')='array'
      THEN d.properties->'fields' ELSE '[]'::jsonb END
    ) f(field)
    WHERE COALESCE(jsonb_typeof(f.field),'')<>'object'
     OR COALESCE(f.field->>'apiName','') !~ '^[A-Za-z][A-Za-z0-9_]*$'
     OR COALESCE(length(btrim(f.field->>'label')),0) NOT BETWEEN 1 AND 255
     OR COALESCE(f.field->>'dataType','') NOT IN (
      'Text(255)','Long Text Area','Number','Currency','Percent','Checkbox','Date','DateTime','Picklist')
     OR (f.field ? 'required' AND COALESCE(jsonb_typeof(f.field->'required'),'')<>'boolean')
     OR (f.field ? 'picklistRestricted'
      AND COALESCE(jsonb_typeof(f.field->'picklistRestricted'),'')<>'boolean')
     OR (f.field ? 'picklistValues'
      AND COALESCE(jsonb_typeof(f.field->'picklistValues'),'')<>'array')
     OR jsonb_array_length(CASE WHEN jsonb_typeof(f.field->'picklistValues')='array'
      THEN f.field->'picklistValues' ELSE '[]'::jsonb END)>500
     OR (f.field->>'dataType'<>'Picklist' AND (
      CASE WHEN jsonb_typeof(f.field->'picklistRestricted')='boolean'
       THEN (f.field->>'picklistRestricted')::boolean ELSE false END
      OR jsonb_array_length(CASE WHEN jsonb_typeof(f.field->'picklistValues')='array'
       THEN f.field->'picklistValues' ELSE '[]'::jsonb END)>0
     ))
     OR (f.field->>'dataType'='Picklist'
      AND CASE WHEN jsonb_typeof(f.field->'picklistRestricted')='boolean'
       THEN (f.field->>'picklistRestricted')::boolean ELSE false END
      AND jsonb_array_length(CASE WHEN jsonb_typeof(f.field->'picklistValues')='array'
       THEN f.field->'picklistValues' ELSE '[]'::jsonb END)=0)
     OR EXISTS(
      SELECT 1 FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(f.field->'picklistValues')='array'
        THEN f.field->'picklistValues' ELSE '[]'::jsonb END
      ) v(value)
      WHERE COALESCE(jsonb_typeof(v.value),'')<>'string'
       OR COALESCE(length(btrim(v.value #>> '{}')),0) NOT BETWEEN 1 AND 255
     )
   )
   OR EXISTS(
    SELECT f.field->>'apiName' FROM jsonb_array_elements(
     CASE WHEN jsonb_typeof(d.properties->'fields')='array'
      THEN d.properties->'fields' ELSE '[]'::jsonb END
    ) f(field)
    GROUP BY f.field->>'apiName' HAVING count(*)>1
   )
  )
 ) THEN
  RAISE EXCEPTION 'Platform Event metadata must be repaired before relational migration';
 END IF;
END
$migration$;
INSERT INTO md_platform_event_details(tenant_id,event_api_name,description)
SELECT tenant_id,api_name,COALESCE(properties->>'description','')
FROM md_system_definitions WHERE kind='platform-events'
ON CONFLICT(tenant_id,event_api_name) DO NOTHING;
INSERT INTO md_platform_event_fields
 (tenant_id,event_api_name,field_api,label,data_type,required,picklist_restricted,sort_order)
SELECT DISTINCT ON (d.tenant_id,d.api_name,f.field->>'apiName')
 d.tenant_id,d.api_name,f.field->>'apiName',f.field->>'label',f.field->>'dataType',
 CASE WHEN f.field->>'required' IN ('true','false') THEN (f.field->>'required')::boolean ELSE false END,
 CASE WHEN f.field->>'picklistRestricted' IN ('true','false')
  THEN (f.field->>'picklistRestricted')::boolean ELSE false END,(f.ordinality-1)::integer
FROM md_system_definitions d
CROSS JOIN LATERAL jsonb_array_elements(
 CASE WHEN jsonb_typeof(d.properties->'fields')='array' THEN d.properties->'fields' ELSE '[]'::jsonb END
) WITH ORDINALITY AS f(field,ordinality)
WHERE d.kind='platform-events'
 AND f.field->>'apiName' ~ '^[A-Za-z][A-Za-z0-9_]*$'
 AND COALESCE(f.field->>'label','')<>''
 AND f.field->>'dataType' IN (
  'Text(255)','Long Text Area','Number','Currency','Percent','Checkbox','Date','DateTime','Picklist')
ORDER BY d.tenant_id,d.api_name,f.field->>'apiName',f.ordinality
ON CONFLICT(tenant_id,event_api_name,field_api) DO UPDATE SET
 label=EXCLUDED.label,data_type=EXCLUDED.data_type,required=EXCLUDED.required,
 picklist_restricted=EXCLUDED.picklist_restricted,sort_order=EXCLUDED.sort_order;
INSERT INTO md_platform_event_picklist_values
 (tenant_id,event_api_name,field_api,value_text,sort_order)
SELECT DISTINCT ON (d.tenant_id,d.api_name,f.field->>'apiName',v.value)
 d.tenant_id,d.api_name,f.field->>'apiName',v.value,(v.ordinality-1)::integer
FROM md_system_definitions d
CROSS JOIN LATERAL jsonb_array_elements(
 CASE WHEN jsonb_typeof(d.properties->'fields')='array' THEN d.properties->'fields' ELSE '[]'::jsonb END
) WITH ORDINALITY AS f(field,ordinality)
CROSS JOIN LATERAL jsonb_array_elements_text(
 CASE WHEN jsonb_typeof(f.field->'picklistValues')='array' THEN f.field->'picklistValues' ELSE '[]'::jsonb END
) WITH ORDINALITY AS v(value,ordinality)
WHERE d.kind='platform-events'
 AND f.field->>'dataType'='Picklist' AND v.value<>''
 AND EXISTS(SELECT 1 FROM md_platform_event_fields x WHERE x.tenant_id=d.tenant_id
  AND x.event_api_name=d.api_name AND x.field_api=f.field->>'apiName')
ORDER BY d.tenant_id,d.api_name,f.field->>'apiName',v.value,v.ordinality
ON CONFLICT(tenant_id,event_api_name,field_api,value_text) DO UPDATE SET
 sort_order=EXCLUDED.sort_order;
UPDATE md_system_definitions SET properties='{}'::jsonb WHERE kind='platform-events';
