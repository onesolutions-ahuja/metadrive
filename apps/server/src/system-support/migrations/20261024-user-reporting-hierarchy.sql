-- Tenant-scoped reporting tree, independent of roles and permission sets.
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS reports_to_user_id uuid;
CREATE INDEX IF NOT EXISTS md_users_reports_to_idx ON md_users(tenant_id,reports_to_user_id);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='md_users_reports_to_tenant_fk') THEN
  ALTER TABLE md_users ADD CONSTRAINT md_users_reports_to_tenant_fk
   FOREIGN KEY(tenant_id,reports_to_user_id) REFERENCES md_users(tenant_id,id)
   DEFERRABLE INITIALLY IMMEDIATE;
 END IF;
END $$;
-- Pre-existing tenants: attach orphans to the canonical tenant developer identity.
UPDATE md_users u SET reports_to_user_id=d.user_id
FROM md_tenant_developer_accounts d
WHERE u.tenant_id=d.tenant_id AND u.id<>d.user_id AND u.reports_to_user_id IS NULL;
CREATE OR REPLACE FUNCTION md_reporting_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root_user uuid;
BEGIN
 SELECT d.user_id INTO root_user FROM md_tenant_developer_accounts d WHERE d.tenant_id=NEW.tenant_id;
 IF root_user IS NOT NULL AND NEW.id=root_user THEN
  IF NEW.reports_to_user_id IS NOT NULL THEN RAISE EXCEPTION 'Tenant developer reporting root cannot have a manager'; END IF;
 ELSIF NEW.reports_to_user_id IS NULL AND root_user IS NOT NULL THEN
  NEW.reports_to_user_id:=root_user;
 END IF;
 IF NEW.reports_to_user_id=NEW.id THEN RAISE EXCEPTION 'User cannot report to itself'; END IF;
 IF NEW.reports_to_user_id IS NOT NULL THEN
  IF NOT EXISTS (SELECT 1 FROM md_users p WHERE p.tenant_id=NEW.tenant_id AND p.id=NEW.reports_to_user_id) THEN
   RAISE EXCEPTION 'Reporting manager not found in tenant';
  END IF;
  IF TG_OP='UPDATE' AND NEW.reports_to_user_id IS DISTINCT FROM OLD.reports_to_user_id THEN
   IF EXISTS (
    WITH RECURSIVE downline(id) AS (
     SELECT NEW.id UNION
     SELECT c.id FROM md_users c JOIN downline a ON c.reports_to_user_id=a.id
     WHERE c.tenant_id=NEW.tenant_id
    ) SELECT 1 FROM downline WHERE id=NEW.reports_to_user_id
   ) THEN RAISE EXCEPTION 'Circular reporting hierarchy'; END IF;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS md_users_reporting_guard ON md_users;
CREATE TRIGGER md_users_reporting_guard BEFORE INSERT OR UPDATE OF reports_to_user_id ON md_users
FOR EACH ROW EXECUTE FUNCTION md_reporting_guard();
CREATE OR REPLACE FUNCTION md_user_descendants(t uuid, manager uuid, include_self boolean DEFAULT true)
RETURNS TABLE(user_id uuid, depth integer) LANGUAGE sql STABLE AS $$
 WITH RECURSIVE tree(id,d) AS (
  SELECT u.id,0 FROM md_users u WHERE u.tenant_id=t AND u.id=manager
  UNION
  SELECT c.id,tree.d+1 FROM md_users c JOIN tree ON c.reports_to_user_id=tree.id
  WHERE c.tenant_id=t AND tree.d<1000
 )
 SELECT id,d FROM tree WHERE include_self OR d>0
$$;
CREATE OR REPLACE FUNCTION md_user_ancestors(t uuid, subject uuid, include_self boolean DEFAULT false)
RETURNS TABLE(user_id uuid, depth integer) LANGUAGE sql STABLE AS $$
 WITH RECURSIVE tree(id,parent,d) AS (
  SELECT u.id,u.reports_to_user_id,0 FROM md_users u WHERE u.tenant_id=t AND u.id=subject
  UNION
  SELECT p.id,p.reports_to_user_id,tree.d+1
  FROM md_users p JOIN tree ON p.id=tree.parent AND p.tenant_id=t WHERE tree.d<1000
 )
 SELECT id,d FROM tree WHERE include_self OR d>0
$$;
