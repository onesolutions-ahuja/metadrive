-- Phase 5: durable human approvals, no JSON graph state or separate workflow engine.
-- Upgrade preserves all tenant data and existing published flows.
ALTER TABLE md_flow_runs DROP CONSTRAINT IF EXISTS md_flow_runs_wait_kind_check;
ALTER TABLE md_flow_runs ADD CONSTRAINT md_flow_runs_wait_kind_check
 CHECK(wait_kind IN ('wait','scheduled-path','orchestration'));

CREATE TABLE IF NOT EXISTS md_flow_approval_stages (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 run_id uuid NOT NULL,
 element_id integer NOT NULL CHECK(element_id > 0),
 group_id uuid NOT NULL,
 rule text NOT NULL CHECK(rule IN ('ANY','ALL')),
 status text NOT NULL DEFAULT 'waiting'
  CHECK(status IN ('waiting','Approved','Rejected','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz,
 PRIMARY KEY(tenant_id,run_id,element_id),
 UNIQUE(tenant_id,group_id),
 FOREIGN KEY(tenant_id,run_id) REFERENCES md_flow_runs(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_flow_approval_stages_pending
 ON md_flow_approval_stages(tenant_id,run_id,status) WHERE status='waiting';

-- Enable only when the installed baseline registry is still administrator-unmodified.
UPDATE md_flow_capability_flow_types
 SET create_enabled=true,validate_enabled=true,debug_enabled=true,registry_version=3
 WHERE flow_type='Flow Orchestration' AND create_enabled=false
  AND validate_enabled=false AND registry_version=1;

INSERT INTO md_flow_capability_elements
 (element_type,display_group,display_icon,sort_order,builder_enabled,before_save_allowed,
  config_schema_key,validator_key,runtime_handler_key,debug_behavior,registry_version)
 VALUES ('Orchestration Stage','Interaction','◎',210,true,false,
 'flow:Orchestration Stage','Orchestration Stage','Orchestration Stage','simulate',3)
 ON CONFLICT(element_type) DO NOTHING;

INSERT INTO md_flow_capability_element_flows(element_type,flow_type,builder_allowed)
 VALUES ('Orchestration Stage','Flow Orchestration',true)
 ON CONFLICT(element_type,flow_type) DO NOTHING;

-- Reuse general-purpose Flow operations only; Screens and record-only Custom Error
-- remain excluded. SQL allows no app-specific Core handlers.
INSERT INTO md_flow_capability_element_flows(element_type,flow_type,builder_allowed)
 SELECT element_type,'Flow Orchestration',builder_allowed
 FROM md_flow_capability_element_flows
 WHERE flow_type='Autolaunched Flow'
  AND element_type NOT IN ('Screen','Custom Error','Orchestration Stage')
 ON CONFLICT(element_type,flow_type) DO NOTHING;

INSERT INTO md_flow_capability_properties
 (element_type,property_name,value_type,required,sort_order)
 VALUES ('Orchestration Stage','objectApiName','text',true,10),
 ('Orchestration Stage','recordId','resource',true,20),
 ('Orchestration Stage','approvalMode','text',true,30),
 ('Orchestration Stage','statusVariable','resource',false,40)
 ON CONFLICT(element_type,property_name) DO NOTHING;
