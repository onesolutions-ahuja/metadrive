CREATE TABLE IF NOT EXISTS md_encrypted_field_access_audit (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  record_id uuid NOT NULL,
  object_api text NOT NULL,
  field_api text NOT NULL,
  accessed_by uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id,id),
  FOREIGN KEY(tenant_id,record_id,object_api)
    REFERENCES md_records(tenant_id,id,object_api) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,object_api,field_api)
    REFERENCES md_field_definitions(tenant_id,object_api,api_name) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id,accessed_by) REFERENCES md_users(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_encrypted_field_access_audit_lookup
  ON md_encrypted_field_access_audit(tenant_id,object_api,field_api,occurred_at DESC);
