ALTER TABLE md_screen_interviews ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now()+interval '24 hours');
CREATE INDEX IF NOT EXISTS md_screen_interviews_expire ON md_screen_interviews(expires_at) WHERE status='waiting';
