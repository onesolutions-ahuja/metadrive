-- Stable tenant settings use relational columns and indexed rows, not monolithic state.
CREATE TABLE IF NOT EXISTS md_tenant_company_settings (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),
 logo_url text NOT NULL DEFAULT '',
 legal_name text NOT NULL DEFAULT '',
 trading_name text NOT NULL DEFAULT '',
 website text NOT NULL DEFAULT '',
 phone text NOT NULL DEFAULT '',
 email text NOT NULL DEFAULT '',
 address_line1 text NOT NULL DEFAULT '',
 address_line2 text NOT NULL DEFAULT '',
 city text NOT NULL DEFAULT '',
 postcode text NOT NULL DEFAULT '',
 country text NOT NULL DEFAULT '',
 timezone text NOT NULL DEFAULT 'Europe/London',
 locale text NOT NULL DEFAULT 'en-GB',
 description text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS md_tenant_currency_settings (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),
 corporate_currency text NOT NULL DEFAULT 'USD'
  CHECK(corporate_currency ~ '^[A-Z]{3}$'),
 standard_vat_rate numeric(6,3) NOT NULL DEFAULT 20
  CHECK(standard_vat_rate BETWEEN 0 AND 100)
);
CREATE TABLE IF NOT EXISTS md_tenant_currency_rates (
 tenant_id uuid NOT NULL REFERENCES md_tenants(id),
 currency_code text NOT NULL CHECK(currency_code ~ '^[A-Z]{3}$'),
 conversion_rate numeric(20,8) NOT NULL CHECK(conversion_rate>0),
 PRIMARY KEY(tenant_id,currency_code)
);
CREATE TABLE IF NOT EXISTS md_tenant_automation_settings (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id),
 auto_retry_failed_flows boolean NOT NULL DEFAULT false,
 max_retry_attempts integer NOT NULL DEFAULT 10 CHECK(max_retry_attempts BETWEEN 0 AND 100),
 conversation_idle_minutes integer NOT NULL DEFAULT 15 CHECK(conversation_idle_minutes BETWEEN 1 AND 1440)
);
