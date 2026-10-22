-- PIN material never stored in a generic readable User record field.
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS till_pin_hash text;
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS till_pin_failures integer NOT NULL DEFAULT 0;
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS till_pin_locked_until timestamptz;
-- Object Manager can show that the setting exists, but must never expose the hash.
INSERT INTO md_field_definitions(tenant_id,object_api,api_name,label,data_type,required)
SELECT t.id,'User','UserPin','Till PIN configured','boolean',false FROM md_tenants t
ON CONFLICT (tenant_id,object_api,api_name) DO NOTHING;
