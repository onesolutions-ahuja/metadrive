-- Typed Page Component properties are stored centrally and materialised only for
-- installed packages. Reference names resolve to tenant-local SQL metadata IDs.
CREATE TABLE IF NOT EXISTS md_app_package_page_property_templates (
 app_id uuid NOT NULL,version integer NOT NULL,
 page_api text NOT NULL,component_api text NOT NULL,
 slot text NOT NULL,sort_order integer NOT NULL DEFAULT 0,
 property_path text NOT NULL CHECK(length(property_path) BETWEEN 1 AND 1024),
 data_type text NOT NULL CHECK(data_type IN ('string','number','boolean','null','array','object','reference')),
 value_text text,
 reference_kind text CHECK(reference_kind IN ('Object','Field','Flow')),
 reference_api text,
 reference_parent_api text,
 PRIMARY KEY(app_id,version,page_api,component_api,slot,sort_order,property_path),
 FOREIGN KEY(app_id,version) REFERENCES md_app_package_versions(app_id,version) ON DELETE CASCADE,
 CHECK(
   (data_type='reference' AND reference_kind IS NOT NULL AND reference_api IS NOT NULL
    AND value_text IS NULL)
   OR (data_type<>'reference' AND reference_kind IS NULL AND reference_api IS NULL
       AND reference_parent_api IS NULL)
 )
);
