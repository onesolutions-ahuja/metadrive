-- Phase 2: an email Quick Action is a credential reference plus sender address,
-- never a stored password or provider-specific integration.
ALTER TABLE md_object_actions ADD COLUMN IF NOT EXISTS credential_id uuid;
ALTER TABLE md_object_actions ADD COLUMN IF NOT EXISTS from_email text;
ALTER TABLE md_object_actions DROP CONSTRAINT IF EXISTS md_object_actions_behavior_contract;
ALTER TABLE md_object_actions ADD CONSTRAINT md_object_actions_behavior_contract CHECK(
 (action_type='Standard' AND behavior IS NULL AND field_api IS NULL AND value_text IS NULL
  AND target_object_api IS NULL AND relationship_field_api IS NULL AND flow_api_name IS NULL
  AND credential_id IS NULL AND from_email IS NULL)
 OR (action_type='Custom' AND (
   (behavior='Set Field Value' AND field_api IS NOT NULL AND value_text IS NOT NULL
     AND target_object_api IS NULL AND flow_api_name IS NULL AND relationship_field_api IS NULL
     AND credential_id IS NULL AND from_email IS NULL)
   OR (behavior='Log Call' AND field_api IS NULL AND target_object_api IS NULL
     AND flow_api_name IS NULL AND relationship_field_api IS NULL AND credential_id IS NULL AND from_email IS NULL)
   OR (behavior='Run Flow' AND flow_api_name IS NOT NULL AND field_api IS NULL
     AND target_object_api IS NULL AND relationship_field_api IS NULL AND credential_id IS NULL AND from_email IS NULL)
   OR (behavior='Create Related' AND target_object_api IS NOT NULL
     AND relationship_field_api IS NOT NULL AND field_api IS NULL AND flow_api_name IS NULL
     AND credential_id IS NULL AND from_email IS NULL)
   OR (behavior='Send Email' AND credential_id IS NOT NULL AND from_email IS NOT NULL
     AND length(from_email)<=254 AND from_email~'^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
     AND field_api IS NULL AND flow_api_name IS NULL AND relationship_field_api IS NULL
     AND target_object_api IS NULL AND value_text IS NULL)
  ))
);
