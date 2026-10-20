ALTER TABLE md_platform_event_messages
 ADD COLUMN IF NOT EXISTS replay_id bigserial;

CREATE UNIQUE INDEX IF NOT EXISTS md_platform_event_messages_replay
 ON md_platform_event_messages(tenant_id,replay_id);
