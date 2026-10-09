-- 1. Seed Core Metadata Objects
INSERT INTO sys_objects (api_name, label, plural_label) 
VALUES 
  ('Account', 'Account', 'Accounts'),
  ('Contact', 'Contact', 'Contacts')
ON CONFLICT (api_name) DO NOTHING;

-- 2. Seed Fields for Account & Contact
DO $$
DECLARE
  account_id INT;
  contact_id INT;
BEGIN
  SELECT id INTO account_id FROM sys_objects WHERE api_name = 'Account';
  SELECT id INTO contact_id FROM sys_objects WHERE api_name = 'Contact';

  -- Account Metadata Fields
  INSERT INTO sys_fields (object_id, api_name, label, field_type, is_required) VALUES
    (account_id, 'Name', 'Account Name', 'Text', true),
    (account_id, 'Industry', 'Industry', 'Text', false),
    (account_id, 'AnnualRevenue', 'Annual Revenue', 'Number', false),
    (account_id, 'Rating', 'Rating', 'Text', false)
  ON CONFLICT (object_id, api_name) DO NOTHING;

  -- Contact Metadata Fields
  INSERT INTO sys_fields (object_id, api_name, label, field_type, is_required) VALUES
    (contact_id, 'FirstName', 'First Name', 'Text', false),
    (contact_id, 'LastName', 'Last Name', 'Text', true),
    (contact_id, 'Email', 'Email Address', 'Text', false),
    (contact_id, 'Phone', 'Phone Number', 'Text', false)
  ON CONFLICT (object_id, api_name) DO NOTHING;
END $$;

-- 3. Seed Initial Records (JSONB)
INSERT INTO sys_records (object_api_name, data) VALUES
  ('Account', '{"Name": "Gringotts Wizarding Bank", "Industry": "Finance", "AnnualRevenue": 15000000, "Rating": "Hot"}'::jsonb),
  ('Account', '{"Name": "Ollivanders Wands", "Industry": "Retail", "AnnualRevenue": 2500000, "Rating": "Warm"}'::jsonb),
  ('Account', '{"Name": "Flourish and Blotts", "Industry": "Retail", "AnnualRevenue": 800000, "Rating": "Warm"}'::jsonb),
  ('Account', '{"Name": "Borgin and Burkes", "Industry": "Artifacts", "AnnualRevenue": 5000000, "Rating": "Cold"}'::jsonb);