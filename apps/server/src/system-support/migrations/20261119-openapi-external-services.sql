CREATE TABLE IF NOT EXISTS md_external_services(
 tenant_id uuid NOT NULL REFERENCES md_tenants(id) ON DELETE CASCADE,
 api_name text NOT NULL,
 label text NOT NULL,
 server_origin text NOT NULL,
 server_path text NOT NULL DEFAULT '',
 imported_by uuid NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,api_name),
 FOREIGN KEY(tenant_id,imported_by) REFERENCES md_users(tenant_id,id)
);

CREATE TABLE IF NOT EXISTS md_external_service_operations(
 tenant_id uuid NOT NULL,
 service_api text NOT NULL,
 operation_api text NOT NULL,
 label text NOT NULL,
 http_method text NOT NULL CHECK(http_method IN ('GET','POST','PUT','PATCH','DELETE')),
 path_template text NOT NULL,
 request_body_required boolean NOT NULL DEFAULT false,
 request_body_type text,
 PRIMARY KEY(tenant_id,service_api,operation_api),
 FOREIGN KEY(tenant_id,service_api)
  REFERENCES md_external_services(tenant_id,api_name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS md_external_service_parameters(
 tenant_id uuid NOT NULL,
 service_api text NOT NULL,
 operation_api text NOT NULL,
 parameter_name text NOT NULL,
 parameter_location text NOT NULL CHECK(parameter_location IN ('path','query','body')),
 required boolean NOT NULL,
 value_type text NOT NULL CHECK(value_type IN ('string','number','integer','boolean')),
 PRIMARY KEY(tenant_id,service_api,operation_api,parameter_name,parameter_location),
 FOREIGN KEY(tenant_id,service_api,operation_api)
  REFERENCES md_external_service_operations(tenant_id,service_api,operation_api) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS md_external_service_operation_tenant_api
 ON md_external_service_operations(tenant_id,operation_api);
