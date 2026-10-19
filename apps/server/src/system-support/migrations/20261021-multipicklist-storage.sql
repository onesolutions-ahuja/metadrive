CREATE TABLE IF NOT EXISTS md_record_multi_values (
  tenant_id uuid NOT NULL,
  record_id uuid NOT NULL,
  object_api text NOT NULL,
  field_api text NOT NULL,
  value text NOT NULL CHECK(length(value) BETWEEN 1 AND 512),
  sort_order integer NOT NULL CHECK(sort_order>=0),
  PRIMARY KEY(tenant_id,record_id,field_api,value),
  FOREIGN KEY(tenant_id,record_id,object_api)
    REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_record_multi_values_lookup
  ON md_record_multi_values(tenant_id,object_api,field_api,value,record_id);

INSERT INTO md_record_multi_values(tenant_id,record_id,object_api,field_api,value,sort_order)
SELECT v.tenant_id,v.record_id,v.object_api,v.field_api,selected.value,
       selected.ordinality::integer-1
FROM md_record_values v
JOIN md_field_definitions f
  ON f.tenant_id=v.tenant_id AND f.object_api=v.object_api AND f.api_name=v.field_api
CROSS JOIN LATERAL unnest(string_to_array(v.value_text,';')) WITH ORDINALITY AS selected(value,ordinality)
WHERE f.data_type='multipicklist' AND v.value_text IS NOT NULL AND v.value_text<>''
ON CONFLICT(tenant_id,record_id,field_api,value) DO NOTHING;
