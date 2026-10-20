-- Preserve declarative rule history across edits while keeping active metadata relational.
ALTER TABLE md_validation_rules ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1
 CHECK(revision>0);
ALTER TABLE md_field_default_formulas ADD COLUMN IF NOT EXISTS revision integer NOT NULL DEFAULT 1
 CHECK(revision>0);

CREATE TABLE IF NOT EXISTS md_validation_rule_history(
 tenant_id uuid NOT NULL,
 object_api text NOT NULL,
 rule_api text NOT NULL,
 revision integer NOT NULL,
 label text NOT NULL,
 expression text NOT NULL,
 error_message text NOT NULL,
 error_field_api text,
 active boolean NOT NULL,
 sort_order integer NOT NULL,
 saved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,object_api,rule_api,revision),
 FOREIGN KEY(tenant_id,object_api)
   REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_field_default_formula_history(
 tenant_id uuid NOT NULL,
 object_api text NOT NULL,
 field_api text NOT NULL,
 revision integer NOT NULL,
 expression text NOT NULL,
 saved_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,object_api,field_api,revision),
 FOREIGN KEY(tenant_id,object_api)
   REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE
);
