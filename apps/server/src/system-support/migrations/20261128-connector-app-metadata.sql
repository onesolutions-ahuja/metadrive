-- Connector app ownership and non-secret, independently editable tenant configuration fields.
CREATE TABLE IF NOT EXISTS md_connector_app_credentials (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 app_id uuid NOT NULL REFERENCES md_apps(id),
 credential_id uuid NOT NULL,
 credential_name text NOT NULL,
 provisioned boolean NOT NULL DEFAULT false,
 PRIMARY KEY(tenant_id,app_id,credential_name),
 FOREIGN KEY (tenant_id,credential_id) REFERENCES md_named_credentials(tenant_id,id)
);
CREATE INDEX IF NOT EXISTS md_connector_app_credentials_ref
 ON md_connector_app_credentials(tenant_id,credential_id);
CREATE TABLE IF NOT EXISTS md_connector_app_fields (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 app_id uuid NOT NULL REFERENCES md_apps(id),
 credential_name text NOT NULL,
 field_api text NOT NULL CHECK(field_api ~ '^public_[A-Za-z][A-Za-z0-9_]*$'),
 label text NOT NULL,
 required boolean NOT NULL DEFAULT false,
 default_value text NOT NULL DEFAULT '',
 PRIMARY KEY(tenant_id,app_id,credential_name,field_api),
 FOREIGN KEY(tenant_id,app_id,credential_name)
 REFERENCES md_connector_app_credentials(tenant_id,app_id,credential_name)
);
