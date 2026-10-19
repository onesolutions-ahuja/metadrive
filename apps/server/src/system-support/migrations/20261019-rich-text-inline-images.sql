CREATE TABLE IF NOT EXISTS md_record_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES md_tenants(id) ON DELETE CASCADE,
  object_api text NOT NULL,
  record_id uuid NOT NULL,
  field_api text NOT NULL,
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 255),
  content_type text NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/gif','image/webp')),
  byte_size integer NOT NULL CHECK(byte_size BETWEEN 1 AND 1048576),
  checksum text NOT NULL CHECK(checksum ~ '^[0-9a-f]{64}$'),
  content bytea NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(octet_length(content)=byte_size),
  FOREIGN KEY(tenant_id,record_id,object_api)
    REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,created_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_record_files_record_field
  ON md_record_files(tenant_id,object_api,record_id,field_api,created_at);
