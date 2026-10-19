CREATE TABLE IF NOT EXISTS md_object_actions (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  action_id text NOT NULL,
  label text NOT NULL,
  action_type text NOT NULL CHECK(action_type IN ('Standard','Custom')),
  enabled boolean NOT NULL DEFAULT true,
  behavior text,
  field_api text,
  value_text text,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY(tenant_id,object_api,action_id),
  FOREIGN KEY(tenant_id,object_api)
    REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE,
  CHECK(action_id ~ '^[A-Za-z][A-Za-z0-9_-]*$'),
  CHECK(length(label) BETWEEN 1 AND 80),
  CHECK(value_text IS NULL OR length(value_text)<=10000),
  CHECK((action_type='Custom' AND behavior='Set Field Value' AND field_api IS NOT NULL
      AND value_text IS NOT NULL) OR (action_type='Standard' AND behavior IS NULL
      AND field_api IS NULL AND value_text IS NULL))
);
