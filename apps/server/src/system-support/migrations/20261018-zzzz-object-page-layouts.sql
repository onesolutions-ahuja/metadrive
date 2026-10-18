-- Tenant-scoped relational Page Layout metadata. No prior layouts or records are changed.
CREATE TABLE IF NOT EXISTS md_object_layout_versions (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,object_api),
  FOREIGN KEY (tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_page_layouts (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  layout_id text NOT NULL CHECK (length(layout_id) BETWEEN 1 AND 128),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,object_api,layout_id),
  FOREIGN KEY (tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_page_layout_sections (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  layout_id text NOT NULL,
  section_id text NOT NULL CHECK (length(section_id) BETWEEN 1 AND 128),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  columns smallint NOT NULL CHECK (columns IN (1,2)),
  sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,object_api,layout_id,section_id),
  FOREIGN KEY (tenant_id,object_api,layout_id) REFERENCES md_object_page_layouts(tenant_id,object_api,layout_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_page_layout_fields (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  layout_id text NOT NULL,
  section_id text NOT NULL,
  field_api text NOT NULL,
  sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,object_api,layout_id,section_id,field_api),
  FOREIGN KEY (tenant_id,object_api,layout_id,section_id) REFERENCES md_object_page_layout_sections(tenant_id,object_api,layout_id,section_id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id,object_api,field_api) REFERENCES md_field_definitions(tenant_id,object_api,api_name)
);
CREATE TABLE IF NOT EXISTS md_object_page_layout_actions (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  layout_id text NOT NULL,
  action_name text NOT NULL CHECK (length(action_name) BETWEEN 1 AND 128),
  sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,object_api,layout_id,action_name),
  FOREIGN KEY (tenant_id,object_api,layout_id) REFERENCES md_object_page_layouts(tenant_id,object_api,layout_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_page_layout_related_lists (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  layout_id text NOT NULL,
  list_name text NOT NULL CHECK (length(list_name) BETWEEN 1 AND 128),
  sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,object_api,layout_id,list_name),
  FOREIGN KEY (tenant_id,object_api,layout_id) REFERENCES md_object_page_layouts(tenant_id,object_api,layout_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_page_layout_links (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  layout_id text NOT NULL,
  link_id text NOT NULL CHECK (length(link_id) BETWEEN 1 AND 128),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
  url text NOT NULL CHECK (length(url) BETWEEN 1 AND 2048),
  open_in_new_window boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL,
  PRIMARY KEY (tenant_id,object_api,layout_id,link_id),
  FOREIGN KEY (tenant_id,object_api,layout_id) REFERENCES md_object_page_layouts(tenant_id,object_api,layout_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_page_layout_assignments (
  tenant_id uuid NOT NULL,
  object_api text NOT NULL,
  profile_id text NOT NULL CHECK (length(profile_id) BETWEEN 1 AND 128),
  record_type_id text NOT NULL CHECK (length(record_type_id) BETWEEN 1 AND 128),
  layout_id text NOT NULL,
  PRIMARY KEY (tenant_id,object_api,profile_id,record_type_id),
  FOREIGN KEY (tenant_id,object_api,layout_id) REFERENCES md_object_page_layouts(tenant_id,object_api,layout_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS md_object_page_layout_fields_lookup ON md_object_page_layout_fields(tenant_id,object_api,layout_id);


-- Idempotent backfill: add a default only where the object has no Page Layout.
-- Never overwrite or replace tenant-owned configurations.
INSERT INTO md_object_page_layouts(tenant_id,object_api,layout_id,label,sort_order)
SELECT o.tenant_id,o.api_name,'default',o.label||' Layout',0
FROM md_object_definitions o WHERE NOT EXISTS (
 SELECT 1 FROM md_object_page_layouts l
 WHERE l.tenant_id=o.tenant_id AND l.object_api=o.api_name
) ON CONFLICT DO NOTHING;
INSERT INTO md_object_page_layout_sections(tenant_id,object_api,layout_id,section_id,label,columns,sort_order)
SELECT l.tenant_id,l.object_api,l.layout_id,'details','Record Information',2,0
FROM md_object_page_layouts l
WHERE l.layout_id='default' AND NOT EXISTS (
 SELECT 1 FROM md_object_page_layout_sections s
 WHERE s.tenant_id=l.tenant_id AND s.object_api=l.object_api AND s.layout_id=l.layout_id
) ON CONFLICT DO NOTHING;
INSERT INTO md_object_page_layout_fields(tenant_id,object_api,layout_id,section_id,field_api,sort_order)
SELECT s.tenant_id,s.object_api,s.layout_id,s.section_id,f.api_name,
 row_number() OVER (PARTITION BY s.tenant_id,s.object_api,s.layout_id,s.section_id ORDER BY f.api_name)-1
FROM md_object_page_layout_sections s JOIN md_field_definitions f
 ON f.tenant_id=s.tenant_id AND f.object_api=s.object_api
WHERE s.layout_id='default' AND s.section_id='details'
AND NOT EXISTS (
 SELECT 1 FROM md_object_page_layout_fields pf
 WHERE pf.tenant_id=s.tenant_id AND pf.object_api=s.object_api AND pf.layout_id=s.layout_id
) ON CONFLICT DO NOTHING;
INSERT INTO md_object_page_layout_actions(tenant_id,object_api,layout_id,action_name,sort_order)
SELECT l.tenant_id,l.object_api,l.layout_id,a.action_name,a.sort_order
FROM md_object_page_layouts l
CROSS JOIN (VALUES ('New',0),('Edit',1),('Delete',2)) AS a(action_name,sort_order)
WHERE l.layout_id='default' AND NOT EXISTS (
 SELECT 1 FROM md_object_page_layout_actions x
 WHERE x.tenant_id=l.tenant_id AND x.object_api=l.object_api AND x.layout_id=l.layout_id
) ON CONFLICT DO NOTHING;

-- Normalized, tenant-scoped Lightning Page definition, component tree and activation.
-- Existing app seed pages are retained; no JSON/JSONB storage.
CREATE TABLE IF NOT EXISTS md_lightning_page_details (
 tenant_id uuid NOT NULL, page_id uuid NOT NULL,
 page_type text NOT NULL CHECK(page_type IN ('Record Page','App Page','Home Page')),
 target_object text NOT NULL DEFAULT '',
 layout_mode text NOT NULL CHECK(layout_mode IN ('template','free-canvas')),
 template text,
 canvas_width integer NOT NULL CHECK(canvas_width BETWEEN 320 AND 10000),
 canvas_height integer NOT NULL CHECK(canvas_height BETWEEN 320 AND 10000),
 status text NOT NULL CHECK(status IN ('Draft','Active')),
 devices text[] NOT NULL CHECK(cardinality(devices) BETWEEN 1 AND 2),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,page_id),
 FOREIGN KEY(tenant_id,page_id) REFERENCES md_page_definitions(tenant_id,id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_lightning_page_nodes (
 tenant_id uuid NOT NULL, page_id uuid NOT NULL,
 component_key text NOT NULL CHECK(length(component_key) BETWEEN 1 AND 128),
 component_type text NOT NULL CHECK(length(component_type) BETWEEN 1 AND 128),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 200),
 region text NOT NULL DEFAULT 'main',
 visible boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL,
 PRIMARY KEY(tenant_id,page_id,component_key),
 FOREIGN KEY(tenant_id,page_id) REFERENCES md_lightning_page_details(tenant_id,page_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_lightning_page_node_properties (
 tenant_id uuid NOT NULL, page_id uuid NOT NULL,
 component_key text NOT NULL,
 property_path text NOT NULL CHECK(length(property_path) BETWEEN 1 AND 1024),
 value_kind text NOT NULL CHECK(value_kind IN ('string','number','boolean','null','array','object')),
 value_text text,
 PRIMARY KEY(tenant_id,page_id,component_key,property_path),
 FOREIGN KEY(tenant_id,page_id,component_key)
   REFERENCES md_lightning_page_nodes(tenant_id,page_id,component_key) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_lightning_page_activation (
 tenant_id uuid NOT NULL, page_id uuid NOT NULL,
 assignment_id text NOT NULL CHECK(length(assignment_id) BETWEEN 1 AND 128),
 scope text NOT NULL CHECK(scope IN ('Org Default','App Default','App and Profile','App, Record Type, and Profile')),
 app_api text, profile_id text, record_type_id text,
 desktop boolean NOT NULL DEFAULT true,
 phone boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL,
 PRIMARY KEY(tenant_id,page_id,assignment_id),
 FOREIGN KEY(tenant_id,page_id) REFERENCES md_lightning_page_details(tenant_id,page_id) ON DELETE CASCADE,
 CHECK(desktop OR phone)
);
CREATE INDEX IF NOT EXISTS md_lightning_page_active_lookup
 ON md_lightning_page_details(tenant_id,target_object,page_type,status);


-- Explicit tenant profiles and grants. Permission evaluation continues to use the shared SQL RBAC engine.
CREATE TABLE IF NOT EXISTS md_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 api_name text NOT NULL,
 label text NOT NULL,
 UNIQUE(tenant_id,id), UNIQUE(tenant_id,api_name)
);
CREATE TABLE IF NOT EXISTS md_user_profiles (
 tenant_id uuid NOT NULL,
 user_id uuid NOT NULL,
 profile_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,user_id),
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,profile_id) REFERENCES md_profiles(tenant_id,id)
);
CREATE TABLE IF NOT EXISTS md_profile_permission_sets (
 tenant_id uuid NOT NULL,
 profile_id uuid NOT NULL,
 permission_set_id uuid NOT NULL,
 PRIMARY KEY(tenant_id,profile_id,permission_set_id),
 FOREIGN KEY(tenant_id,profile_id) REFERENCES md_profiles(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,permission_set_id) REFERENCES md_permission_sets(tenant_id,id) ON DELETE CASCADE
);
INSERT INTO md_profiles(tenant_id,api_name,label)
 SELECT id,'Default','Default Profile' FROM md_tenants
 ON CONFLICT(tenant_id,api_name) DO NOTHING;
INSERT INTO md_user_profiles(tenant_id,user_id,profile_id)
 SELECT u.tenant_id,u.id,p.id FROM md_users u
 JOIN md_profiles p ON p.tenant_id=u.tenant_id AND p.api_name='Default'
 ON CONFLICT(tenant_id,user_id) DO NOTHING;


-- Record types and allowed picklist values are object-scoped relational rows.
CREATE TABLE IF NOT EXISTS md_object_record_types (
 tenant_id uuid NOT NULL,
 object_api text NOT NULL,
 record_type_id text NOT NULL CHECK(length(record_type_id) BETWEEN 1 AND 128),
 developer_name text NOT NULL,
 label text NOT NULL,
 description text NOT NULL DEFAULT '',
 active boolean NOT NULL DEFAULT true,
 is_default boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL DEFAULT 0,
 PRIMARY KEY(tenant_id,object_api,record_type_id),
 FOREIGN KEY(tenant_id,object_api) REFERENCES md_object_definitions(tenant_id,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_object_record_type_values (
 tenant_id uuid NOT NULL,object_api text NOT NULL,record_type_id text NOT NULL,
 field_api text NOT NULL,field_value text NOT NULL,sort_order integer NOT NULL,
 PRIMARY KEY(tenant_id,object_api,record_type_id,field_api,field_value),
 FOREIGN KEY(tenant_id,object_api,record_type_id)
  REFERENCES md_object_record_types(tenant_id,object_api,record_type_id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,object_api,field_api)
  REFERENCES md_field_definitions(tenant_id,object_api,api_name)
);
ALTER TABLE md_records ADD COLUMN IF NOT EXISTS record_type_id text;
INSERT INTO md_object_record_types(tenant_id,object_api,record_type_id,developer_name,label,active,is_default,sort_order)
 SELECT o.tenant_id,o.api_name,'master','Master','Master',true,true,0
 FROM md_object_definitions o WHERE NOT EXISTS(
  SELECT 1 FROM md_object_record_types r WHERE r.tenant_id=o.tenant_id AND r.object_api=o.api_name
 ) ON CONFLICT DO NOTHING;
