ALTER TABLE md_field_definitions
  ADD COLUMN IF NOT EXISTS rollup_filter_logic text NOT NULL DEFAULT 'All'
  CHECK(rollup_filter_logic IN ('All','Any'));

CREATE TABLE IF NOT EXISTS md_field_rollup_filters (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  child_object text NOT NULL,
  rollup_field_api text NOT NULL,
  filter_field_api text NOT NULL,
  operator text NOT NULL CHECK(operator IN
    ('Equals','Not Equal To','Greater Than','Less Than','Contains','Is Null','Is Not Null')),
  value_text text NOT NULL DEFAULT '',
  sort_order integer NOT NULL CHECK(sort_order>=0),
  PRIMARY KEY(tenant_id,object_api,rollup_field_api,sort_order),
  FOREIGN KEY(tenant_id,object_api,rollup_field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,child_object,filter_field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_field_rollup_filters_lookup
  ON md_field_rollup_filters(tenant_id,object_api,rollup_field_api,sort_order);
