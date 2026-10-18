ALTER TABLE md_screen_interviews ADD COLUMN IF NOT EXISTS history jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(history)='array');
