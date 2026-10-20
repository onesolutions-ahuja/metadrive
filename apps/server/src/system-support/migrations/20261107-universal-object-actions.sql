-- Phase 2: extend the existing shared Object Actions registry; preserve all tenant customisations.
ALTER TABLE md_object_actions ADD COLUMN IF NOT EXISTS target_object_api text;
ALTER TABLE md_object_actions ADD COLUMN IF NOT EXISTS relationship_field_api text;
ALTER TABLE md_object_actions ADD COLUMN IF NOT EXISTS flow_api_name text;

DO $$
DECLARE old_name text;
BEGIN
 FOR old_name IN SELECT c.conname FROM pg_constraint c
   WHERE c.conrelid='md_object_actions'::regclass AND c.contype='c'
     AND pg_get_constraintdef(c.oid) LIKE '%Set Field Value%'
 LOOP
   EXECUTE format('ALTER TABLE md_object_actions DROP CONSTRAINT %I',old_name);
 END LOOP;
END $$;

ALTER TABLE md_object_actions DROP CONSTRAINT IF EXISTS md_object_actions_behavior_contract;
ALTER TABLE md_object_actions ADD CONSTRAINT md_object_actions_behavior_contract CHECK(
 (action_type='Standard' AND behavior IS NULL AND field_api IS NULL AND value_text IS NULL
  AND target_object_api IS NULL AND relationship_field_api IS NULL AND flow_api_name IS NULL)
 OR (action_type='Custom' AND (
   (behavior='Set Field Value' AND field_api IS NOT NULL AND value_text IS NOT NULL
     AND target_object_api IS NULL AND flow_api_name IS NULL AND relationship_field_api IS NULL)
   OR (behavior='Log Call' AND field_api IS NULL AND target_object_api IS NULL
     AND flow_api_name IS NULL AND relationship_field_api IS NULL)
   OR (behavior='Run Flow' AND flow_api_name IS NOT NULL AND field_api IS NULL
     AND target_object_api IS NULL AND relationship_field_api IS NULL)
   OR (behavior='Create Related' AND target_object_api IS NOT NULL
     AND relationship_field_api IS NOT NULL AND field_api IS NULL AND flow_api_name IS NULL)
 ))
);
CREATE INDEX IF NOT EXISTS md_object_actions_enabled_lookup
 ON md_object_actions(tenant_id,object_api,action_id) WHERE enabled=true;
