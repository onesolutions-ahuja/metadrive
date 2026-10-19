-- Tenant-scoped custom labels, custom metadata and hierarchy custom settings.
-- All definitions and values are stored in relational columns.
CREATE TABLE IF NOT EXISTS md_custom_labels (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id) ON DELETE CASCADE,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 language text NOT NULL DEFAULT 'en' CHECK(length(language) BETWEEN 2 AND 35),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 255),
 value text NOT NULL CHECK(length(value)<=4000),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,api_name,language)
);
CREATE INDEX IF NOT EXISTS md_custom_labels_lookup
 ON md_custom_labels(tenant_id,language,api_name);

CREATE TABLE IF NOT EXISTS md_custom_metadata_types (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id) ON DELETE CASCADE,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 255),
 description text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,api_name)
);
CREATE TABLE IF NOT EXISTS md_custom_metadata_fields (
 tenant_id uuid NOT NULL,
 type_api text NOT NULL,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 255),
 data_type text NOT NULL CHECK(data_type IN ('text','number','boolean','date','datetime')),
 required boolean NOT NULL DEFAULT false,
 max_length integer CHECK(max_length BETWEEN 1 AND 10000),
 sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),
 PRIMARY KEY(tenant_id,type_api,api_name),
 FOREIGN KEY(tenant_id,type_api) REFERENCES md_custom_metadata_types(tenant_id,api_name) ON DELETE CASCADE,
 CHECK((data_type='text') OR max_length IS NULL)
);
CREATE TABLE IF NOT EXISTS md_custom_metadata_records (
 tenant_id uuid NOT NULL,
 type_api text NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 record_key text NOT NULL CHECK(length(record_key) BETWEEN 1 AND 255),
 master_label text NOT NULL CHECK(length(master_label) BETWEEN 1 AND 255),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,type_api,id),
 UNIQUE(tenant_id,type_api,record_key),
 FOREIGN KEY(tenant_id,type_api) REFERENCES md_custom_metadata_types(tenant_id,api_name) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS md_custom_metadata_values (
 tenant_id uuid NOT NULL,
 type_api text NOT NULL,
 record_id uuid NOT NULL,
 field_api text NOT NULL,
 data_type text NOT NULL CHECK(data_type IN ('text','number','boolean','date','datetime')),
 value_text text,
 value_number numeric,
 value_boolean boolean,
 value_date date,
 value_datetime timestamptz,
 PRIMARY KEY(tenant_id,type_api,record_id,field_api),
 FOREIGN KEY(tenant_id,type_api,record_id)
  REFERENCES md_custom_metadata_records(tenant_id,type_api,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,type_api,field_api)
  REFERENCES md_custom_metadata_fields(tenant_id,type_api,api_name) ON DELETE CASCADE,
 CHECK(
  (data_type='text' AND value_text IS NOT NULL AND value_number IS NULL AND value_boolean IS NULL AND value_date IS NULL AND value_datetime IS NULL) OR
  (data_type='number' AND value_text IS NULL AND value_number IS NOT NULL AND value_boolean IS NULL AND value_date IS NULL AND value_datetime IS NULL) OR
  (data_type='boolean' AND value_text IS NULL AND value_number IS NULL AND value_boolean IS NOT NULL AND value_date IS NULL AND value_datetime IS NULL) OR
  (data_type='date' AND value_text IS NULL AND value_number IS NULL AND value_boolean IS NULL AND value_date IS NOT NULL AND value_datetime IS NULL) OR
  (data_type='datetime' AND value_text IS NULL AND value_number IS NULL AND value_boolean IS NULL AND value_date IS NULL AND value_datetime IS NOT NULL)
 )
);
CREATE INDEX IF NOT EXISTS md_custom_metadata_records_lookup
 ON md_custom_metadata_records(tenant_id,type_api,master_label,record_key);

CREATE TABLE IF NOT EXISTS md_custom_settings (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id) ON DELETE CASCADE,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 255),
 description text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,api_name)
);
CREATE TABLE IF NOT EXISTS md_custom_setting_fields (
 tenant_id uuid NOT NULL,
 setting_api text NOT NULL,
 api_name text NOT NULL CHECK(api_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 255),
 data_type text NOT NULL CHECK(data_type IN ('text','number','boolean','date','datetime')),
 max_length integer CHECK(max_length BETWEEN 1 AND 10000),
 sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order>=0),
 PRIMARY KEY(tenant_id,setting_api,api_name),
 FOREIGN KEY(tenant_id,setting_api) REFERENCES md_custom_settings(tenant_id,api_name) ON DELETE CASCADE,
 CHECK((data_type='text') OR max_length IS NULL)
);
CREATE TABLE IF NOT EXISTS md_custom_setting_entries (
 tenant_id uuid NOT NULL,
 setting_api text NOT NULL,
 id uuid NOT NULL DEFAULT gen_random_uuid(),
 scope text NOT NULL CHECK(scope IN ('organization','profile','user')),
 profile_id uuid,
 user_id uuid,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,setting_api,id),
 FOREIGN KEY(tenant_id,setting_api) REFERENCES md_custom_settings(tenant_id,api_name) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,profile_id) REFERENCES md_profiles(tenant_id,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,user_id) REFERENCES md_users(tenant_id,id) ON DELETE CASCADE,
 CHECK(
  (scope='organization' AND profile_id IS NULL AND user_id IS NULL) OR
  (scope='profile' AND profile_id IS NOT NULL AND user_id IS NULL) OR
  (scope='user' AND profile_id IS NULL AND user_id IS NOT NULL)
 )
);
CREATE UNIQUE INDEX IF NOT EXISTS md_custom_setting_org_entry
 ON md_custom_setting_entries(tenant_id,setting_api) WHERE scope='organization';
CREATE UNIQUE INDEX IF NOT EXISTS md_custom_setting_profile_entry
 ON md_custom_setting_entries(tenant_id,setting_api,profile_id) WHERE scope='profile';
CREATE UNIQUE INDEX IF NOT EXISTS md_custom_setting_user_entry
 ON md_custom_setting_entries(tenant_id,setting_api,user_id) WHERE scope='user';
CREATE TABLE IF NOT EXISTS md_custom_setting_values (
 tenant_id uuid NOT NULL,
 setting_api text NOT NULL,
 entry_id uuid NOT NULL,
 field_api text NOT NULL,
 data_type text NOT NULL CHECK(data_type IN ('text','number','boolean','date','datetime')),
 value_text text,
 value_number numeric,
 value_boolean boolean,
 value_date date,
 value_datetime timestamptz,
 PRIMARY KEY(tenant_id,setting_api,entry_id,field_api),
 FOREIGN KEY(tenant_id,setting_api,entry_id)
  REFERENCES md_custom_setting_entries(tenant_id,setting_api,id) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,setting_api,field_api)
  REFERENCES md_custom_setting_fields(tenant_id,setting_api,api_name) ON DELETE CASCADE,
 CHECK(
  (data_type='text' AND value_text IS NOT NULL AND value_number IS NULL AND value_boolean IS NULL AND value_date IS NULL AND value_datetime IS NULL) OR
  (data_type='number' AND value_text IS NULL AND value_number IS NOT NULL AND value_boolean IS NULL AND value_date IS NULL AND value_datetime IS NULL) OR
  (data_type='boolean' AND value_text IS NULL AND value_number IS NULL AND value_boolean IS NOT NULL AND value_date IS NULL AND value_datetime IS NULL) OR
  (data_type='date' AND value_text IS NULL AND value_number IS NULL AND value_boolean IS NULL AND value_date IS NOT NULL AND value_datetime IS NULL) OR
  (data_type='datetime' AND value_text IS NULL AND value_number IS NULL AND value_boolean IS NULL AND value_date IS NULL AND value_datetime IS NOT NULL)
 )
);
