-- Optional declarative link visibility; empty conditions preserve existing links.
ALTER TABLE md_object_page_layout_links
 ADD COLUMN IF NOT EXISTS visible_when_field text;
ALTER TABLE md_object_page_layout_links
 ADD COLUMN IF NOT EXISTS visible_when_value text;
ALTER TABLE md_object_page_layout_links
 DROP CONSTRAINT IF EXISTS md_record_link_visibility_pair;
ALTER TABLE md_object_page_layout_links
 ADD CONSTRAINT md_record_link_visibility_pair CHECK (
  (visible_when_field IS NULL AND visible_when_value IS NULL)
  OR (visible_when_field ~ '^[A-Za-z][A-Za-z0-9_]*$'
    AND visible_when_value IS NOT NULL AND length(visible_when_value)<=256)
 );
