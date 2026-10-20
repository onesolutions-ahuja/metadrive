-- Phase 3: independent, tenant-owned related-list presentation metadata.
-- Existing rows keep the default behavior; no customer layout is overwritten.
ALTER TABLE md_object_page_layout_related_lists
 ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE md_object_page_layout_related_lists
 DROP CONSTRAINT IF EXISTS md_related_list_settings_object;
ALTER TABLE md_object_page_layout_related_lists
 ADD CONSTRAINT md_related_list_settings_object CHECK(jsonb_typeof(settings)='object');
