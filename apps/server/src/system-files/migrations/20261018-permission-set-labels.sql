ALTER TABLE md_permission_sets ADD COLUMN IF NOT EXISTS label text;
ALTER TABLE md_permission_sets ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '';
UPDATE md_permission_sets SET label=api_name WHERE label IS NULL;
