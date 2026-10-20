-- Matching is deterministic exact comparison, scoped to a tenant and object.
CREATE TABLE IF NOT EXISTS md_matching_rules (
 tenant_id uuid NOT NULL, object_api text NOT NULL,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]{0,79}$'),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 160),
 active boolean NOT NULL DEFAULT false,
 match_mode text NOT NULL DEFAULT 'All' CHECK(match_mode IN ('All','Any')),
 action text NOT NULL DEFAULT 'Alert' CHECK(action IN ('Alert','Block')),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,object_api,api_name),
 FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_matching_rule_fields (
 tenant_id uuid NOT NULL, object_api text NOT NULL, rule_api text NOT NULL,
 field_api text NOT NULL, case_sensitive boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,object_api,rule_api,field_api),
 FOREIGN KEY(tenant_id,object_api,rule_api) REFERENCES md_matching_rules(tenant_id,object_api,api_name) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,object_api,field_api) REFERENCES md_field_definitions(tenant_id,object_api,api_name)
);
CREATE TABLE IF NOT EXISTS md_duplicate_record_sets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL,object_api text NOT NULL,rule_api text NOT NULL,
 record_id uuid NOT NULL, matched_record_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,object_api,rule_api,record_id,matched_record_id),
 FOREIGN KEY(tenant_id,object_api,rule_api) REFERENCES md_matching_rules(tenant_id,object_api,api_name) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,record_id,object_api) REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,matched_record_id,object_api) REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE,
 CHECK(record_id<>matched_record_id)
);
CREATE INDEX IF NOT EXISTS md_duplicate_record_sets_lookup ON md_duplicate_record_sets(tenant_id,object_api,record_id,created_at DESC);
