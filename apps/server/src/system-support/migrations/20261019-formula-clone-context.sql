ALTER TABLE md_records ADD COLUMN IF NOT EXISTS is_clone boolean NOT NULL DEFAULT false;
