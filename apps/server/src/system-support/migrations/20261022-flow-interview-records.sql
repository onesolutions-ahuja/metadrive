-- Durable Flow record variables and collections are represented by SQL references.
CREATE TABLE IF NOT EXISTS md_flow_interview_records (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 run_id uuid NOT NULL,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 object_api text NOT NULL,
 sort_order integer NOT NULL CHECK(sort_order >= 0),
 record_id uuid,
 is_collection boolean NOT NULL,
 PRIMARY KEY(tenant_id,run_id,api_name,sort_order),
 FOREIGN KEY(tenant_id,run_id) REFERENCES md_flow_interview_state(tenant_id,run_id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,record_id,object_api) REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_flow_interview_record_fields (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 run_id uuid NOT NULL,
 api_name text NOT NULL,
 sort_order integer NOT NULL,
 field_api text NOT NULL CHECK(field_api ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 value_text text,
 data_type text NOT NULL CHECK(data_type IN ('string','number','boolean','null')),
 PRIMARY KEY(tenant_id,run_id,api_name,sort_order,field_api),
 FOREIGN KEY(tenant_id,run_id,api_name,sort_order)
   REFERENCES md_flow_interview_records(tenant_id,run_id,api_name,sort_order) ON DELETE CASCADE
);
