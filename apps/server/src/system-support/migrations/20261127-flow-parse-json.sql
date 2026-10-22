-- Shared, no-code Flow JSON selector for signed webhook and HTTP payloads.
INSERT INTO md_flow_capability_elements
(element_type,display_group,display_icon,sort_order,builder_enabled,before_save_allowed,
 config_schema_key,validator_key,runtime_handler_key,debug_behavior,registry_version)
VALUES('Parse JSON','Data','{}',185,true,false,'flow:Parse JSON',
 'Parse JSON','Parse JSON','simulate',4)
ON CONFLICT(element_type) DO NOTHING;
INSERT INTO md_flow_capability_element_flows(element_type,flow_type,builder_allowed)
SELECT 'Parse JSON',flow_type,true FROM md_flow_capability_flow_types
 WHERE flow_type IN ('Autolaunched Flow','Screen Flow','Record-Triggered Flow')
ON CONFLICT(element_type,flow_type) DO NOTHING;
INSERT INTO md_flow_capability_properties(element_type,property_name,value_type,required,sort_order)
VALUES('Parse JSON','source','resource',true,10),
      ('Parse JSON','assignments','list',true,20)
ON CONFLICT(element_type,property_name) DO NOTHING;
