-- Shared Core Flow capabilities are relational SQL metadata, not runtime JSON.
CREATE TABLE IF NOT EXISTS md_flow_capability_flow_types (
 flow_type text PRIMARY KEY,
 description text NOT NULL,
 sort_order integer NOT NULL,
 create_enabled boolean NOT NULL DEFAULT false,
 validate_enabled boolean NOT NULL DEFAULT false,
 debug_enabled boolean NOT NULL DEFAULT false,
 enabled boolean NOT NULL DEFAULT true,
 registry_version integer NOT NULL DEFAULT 1 CHECK(registry_version>0)
);
CREATE TABLE IF NOT EXISTS md_flow_capability_elements (
 element_type text PRIMARY KEY,
 display_group text NOT NULL,
 display_icon text NOT NULL,
 sort_order integer NOT NULL,
 builder_enabled boolean NOT NULL DEFAULT false,
 before_save_allowed boolean NOT NULL DEFAULT false,
 config_schema_key text NOT NULL,
 validator_key text NOT NULL,
 runtime_handler_key text NOT NULL,
 debug_behavior text NOT NULL CHECK(debug_behavior IN ('execute','simulate','unsupported')),
 app_api_name text,
 enabled boolean NOT NULL DEFAULT true,
 registry_version integer NOT NULL DEFAULT 1 CHECK(registry_version>0)
);
CREATE TABLE IF NOT EXISTS md_flow_capability_element_flows (
 element_type text NOT NULL REFERENCES md_flow_capability_elements(element_type),
 flow_type text NOT NULL REFERENCES md_flow_capability_flow_types(flow_type),
 builder_allowed boolean NOT NULL DEFAULT false,
 PRIMARY KEY(element_type,flow_type)
);
CREATE TABLE IF NOT EXISTS md_flow_capability_properties (
 element_type text NOT NULL REFERENCES md_flow_capability_elements(element_type),
 property_name text NOT NULL,
 value_type text NOT NULL CHECK(value_type IN ('text','number','boolean','resource','list','object')),
 required boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL DEFAULT 0,
 PRIMARY KEY(element_type,property_name)
);

-- Idempotent Core seed: do not overwrite administrator modifications or published Flow metadata.
INSERT INTO md_flow_capability_flow_types
(flow_type,description,sort_order,create_enabled,validate_enabled,debug_enabled)
VALUES
 ('Screen Flow','Guide a user through screens and actions.',0,true,true,true),
 ('Autolaunched Flow','Run without screens or from another flow.',10,true,true,true),
 ('Record-Triggered Flow','Run when a record changes.',20,false,true,true),
 ('Schedule-Triggered Flow','Run on a durable schedule.',30,false,true,false),
 ('Platform Event-Triggered Flow','Run after a subscribed platform event.',40,false,true,false),
 ('Flow Orchestration','Coordinate staged human approvals.',50,false,false,false)
ON CONFLICT (flow_type) DO NOTHING;

INSERT INTO md_flow_capability_elements
(element_type,display_group,display_icon,sort_order,builder_enabled,before_save_allowed,
 config_schema_key,validator_key,runtime_handler_key,debug_behavior)
VALUES
 ('Start','Logic','▶',0,false,true,'flow:Start','Start','Start','execute'),
 ('End','Logic','■',10,true,true,'flow:End','End','End','execute'),
 ('Screen','Interaction','▣',20,true,false,'flow:Screen','Screen','Screen','execute'),
 ('Wait','Interaction','◷',30,true,false,'flow:Wait','Wait','Wait','unsupported'),
 ('Action','Interaction','⚡',40,true,false,'flow:Action','Action','Action','unsupported'),
 ('Roll Back Records','Data','↶',50,true,false,'flow:Roll Back Records','Roll Back Records','Roll Back Records','unsupported'),
 ('Custom Error','Logic','!',60,true,true,'flow:Custom Error','Custom Error','Custom Error','unsupported'),
 ('Decision','Logic','◇',70,true,true,'flow:Decision','Decision','Decision','execute'),
 ('Assignment','Logic','⇄',80,true,true,'flow:Assignment','Assignment','Assignment','execute'),
 ('Loop','Logic','↻',90,true,false,'flow:Loop','Loop','Loop','unsupported'),
 ('Create Records','Data','+',100,true,false,'flow:Create Records','Create Records','Create Records','simulate'),
 ('HTTP Callout','Interaction','⇧',110,true,false,'flow:HTTP Callout','HTTP Callout','HTTP Callout','simulate'),
 ('Get Records','Data','↓',120,false,false,'flow:Get Records','Get Records','Get Records','unsupported'),
 ('Update Records','Data','✎',130,false,false,'flow:Update Records','Update Records','Update Records','simulate'),
 ('Delete Records','Data','×',140,false,false,'flow:Delete Records','Delete Records','Delete Records','unsupported'),
 ('Subflow','Interaction','↳',150,false,false,'flow:Subflow','Subflow','Subflow','unsupported'),
 ('Collection Filter','Data','⛃',160,false,false,'flow:Collection Filter','Collection Filter','Collection Filter','unsupported'),
 ('Collection Sort','Data','⇵',170,false,false,'flow:Collection Sort','Collection Sort','Collection Sort','unsupported'),
 ('Transform','Data','⇢',180,false,false,'flow:Transform','Transform','Transform','unsupported'),
 ('Publish Platform Event','Interaction','⇧',190,false,false,'flow:Publish Platform Event','Publish Platform Event','Publish Platform Event','unsupported'),
 ('CreateRecord','Data','+',200,false,false,'flow:CreateRecord','CreateRecord','CreateRecord','simulate')
ON CONFLICT (element_type) DO NOTHING;

INSERT INTO md_flow_capability_element_flows (element_type,flow_type,builder_allowed)
SELECT e.element_type,f.flow_type,
 (e.builder_enabled OR e.element_type='Publish Platform Event')
 AND (e.element_type <> 'Wait' OR f.flow_type IN ('Screen Flow','Autolaunched Flow','Record-Triggered Flow'))
 FROM md_flow_capability_elements e CROSS JOIN md_flow_capability_flow_types f
 WHERE f.validate_enabled AND e.enabled
 AND (e.element_type <> 'Screen' OR f.flow_type = 'Screen Flow')
 AND (e.element_type <> 'Custom Error' OR f.flow_type = 'Record-Triggered Flow')
 AND (e.element_type <> 'Publish Platform Event' OR f.flow_type <> 'Platform Event-Triggered Flow')
ON CONFLICT (element_type,flow_type) DO NOTHING;

-- Discoverable property contracts. Existing runtime validators remain authoritative for semantics.
INSERT INTO md_flow_capability_properties (element_type,property_name,value_type,required,sort_order)
VALUES
 ('Get Records','object','text',true,10),
 ('Get Records','conditions','list',false,20),
 ('Get Records','outputVariable','resource',true,30),
 ('Update Records','object','text',true,10),
 ('Update Records','fieldValues','list',false,20),
 ('Delete Records','object','text',true,10),
 ('Subflow','flowApiName','text',true,10),
 ('Subflow','inputValues','text',false,20),
 ('Subflow','outputValues','text',false,30),
 ('HTTP Callout','namedCredentialId','text',true,10),
 ('HTTP Callout','method','text',false,20),
 ('Wait','waitType','text',false,10),
 ('Publish Platform Event','eventApiName','text',true,10)
ON CONFLICT (element_type,property_name) DO NOTHING;
