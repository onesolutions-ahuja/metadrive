ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS relationship_name text;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS child_relationship_name text;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS delete_behavior text;
ALTER TABLE md_field_definitions ADD COLUMN IF NOT EXISTS allow_reparenting boolean NOT NULL DEFAULT false;
