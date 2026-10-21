-- Custom Error already executes via the shared Flow engine in autolaunched
-- transactions; expose the node via the SQL capability registry as well.
-- Existing tenant customisations and other node permissions remain unchanged.
INSERT INTO md_flow_capability_element_flows(element_type,flow_type,builder_allowed)
SELECT 'Custom Error','Autolaunched Flow',true
WHERE EXISTS(SELECT 1 FROM md_flow_capability_elements WHERE element_type='Custom Error')
  AND EXISTS(SELECT 1 FROM md_flow_capability_flow_types WHERE flow_type='Autolaunched Flow')
ON CONFLICT(element_type,flow_type) DO NOTHING;
