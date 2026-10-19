CREATE TABLE IF NOT EXISTS md_email_alert_details (
 tenant_id uuid NOT NULL,
 kind text NOT NULL DEFAULT 'email-alerts' CHECK(kind='email-alerts'),
 alert_api_name text NOT NULL,
 object_api text NOT NULL,
 credential_id uuid NOT NULL,
 from_email text NOT NULL,
 recipients text NOT NULL,
 subject text NOT NULL,
 body text NOT NULL,
 PRIMARY KEY(tenant_id,alert_api_name),
 FOREIGN KEY(tenant_id,kind,alert_api_name)
  REFERENCES md_system_definitions(tenant_id,kind,api_name) ON DELETE CASCADE,
 FOREIGN KEY(tenant_id,credential_id) REFERENCES md_named_credentials(tenant_id,id)
);
DO $migration$
BEGIN
 IF EXISTS(
  SELECT 1 FROM md_system_definitions d
  LEFT JOIN md_named_credentials c ON c.tenant_id=d.tenant_id
   AND c.id::text=d.properties->>'namedCredentialId'
   AND c.protocol='SMTP' AND c.enabled=true
  WHERE d.kind='email-alerts' AND (
   d.properties-'objectApiName'-'namedCredentialId'-'fromEmail'-'recipients'-'subject'-'body'
    <>'{}'::jsonb
   OR COALESCE(jsonb_typeof(d.properties->'objectApiName'),'')<>'string'
   OR COALESCE(jsonb_typeof(d.properties->'namedCredentialId'),'')<>'string'
   OR COALESCE(jsonb_typeof(d.properties->'fromEmail'),'')<>'string'
   OR COALESCE(jsonb_typeof(d.properties->'recipients'),'')<>'string'
   OR COALESCE(jsonb_typeof(d.properties->'subject'),'')<>'string'
   OR COALESCE(jsonb_typeof(d.properties->'body'),'')<>'string'
   OR COALESCE(d.properties->>'objectApiName','') !~ '^[A-Za-z][A-Za-z0-9_]*$'
   OR COALESCE(d.properties->>'namedCredentialId','') !~
    '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   OR COALESCE(d.properties->>'fromEmail','') !~ '^[^[:space:]@<>]+@[^[:space:]@<>]+\.[^[:space:]@<>]+$'
   OR length(d.properties->>'fromEmail')>254
   OR COALESCE(length(d.properties->>'recipients'),0) NOT BETWEEN 1 AND 4096
   OR COALESCE(length(btrim(d.properties->>'subject')),0) NOT BETWEEN 1 AND 300
   OR COALESCE(d.properties->>'subject','') ~ E'[\\r\\n]'
   OR COALESCE(length(d.properties->>'body'),0)>10000
   OR c.id IS NULL
  )
 ) THEN
  RAISE EXCEPTION 'Email Alert metadata or SMTP credentials must be repaired before relational migration';
 END IF;
END
$migration$;
INSERT INTO md_email_alert_details
 (tenant_id,alert_api_name,object_api,credential_id,from_email,recipients,subject,body)
SELECT tenant_id,api_name,properties->>'objectApiName',
 (properties->>'namedCredentialId')::uuid,properties->>'fromEmail',
 properties->>'recipients',properties->>'subject',properties->>'body'
FROM md_system_definitions WHERE kind='email-alerts'
ON CONFLICT(tenant_id,alert_api_name) DO NOTHING;
UPDATE md_system_definitions SET properties='{}'::jsonb WHERE kind='email-alerts';
