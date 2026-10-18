-- Reusable Formula field definitions use relational tenant/object/field identity.
-- Expressions are parsed by the shared bounded Formula Engine and never eval'd.
CREATE TABLE IF NOT EXISTS md_field_formulas(
 tenant_id uuid NOT NULL,
 object_api text NOT NULL,
 field_api text NOT NULL,
 expression text NOT NULL CHECK(length(expression) BETWEEN 1 AND 2048),
 return_type text NOT NULL CHECK(return_type IN ('Number','Currency','Percent','Text','Checkbox')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,object_api,field_api),
 FOREIGN KEY(tenant_id,object_api,field_api)
   REFERENCES md_field_definitions(tenant_id,object_api,api_name)
);
