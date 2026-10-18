ALTER TABLE md_app_owned_definitions
 ADD COLUMN IF NOT EXISTS disabled_by_uninstall boolean NOT NULL DEFAULT false;
