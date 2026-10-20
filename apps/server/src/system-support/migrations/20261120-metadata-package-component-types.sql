ALTER TABLE md_metadata_package_components
 DROP CONSTRAINT IF EXISTS md_metadata_package_components_component_type_check;
ALTER TABLE md_metadata_package_components
 ADD CONSTRAINT md_metadata_package_components_component_type_check
 CHECK(component_type IN ('object','page','component','flow','object-config','permission-set'));
