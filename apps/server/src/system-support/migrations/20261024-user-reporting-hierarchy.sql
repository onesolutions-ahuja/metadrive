-- Tenant-scoped management reporting hierarchy; roles/permission sets remain independent.
-- Additive, repeatable migration. Never delete or replace existing reporting relationships.
ALTER TABLE md_users ADD COLUMN IF NOT EXISTS reports_to_user_id uuid;
CREATE INDEX IF NOT EXISTS md_users_reporting_parent_idx ON md_users(tenant_id,reports_to_user_id);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='md_users_reporting_tenant_fk') THEN
  ALTER TABLE md_users ADD CONSTRAINT md_users_reporting_tenant_fk
  FOREIGN KEY(tenant_id,reports_to_user_id) REFERENCES md_users(tenant_id,id);
 END IF;
END $$;

-- Walk one tenant's reporting graph. Level 0 is the requested user.
-- Ancestors and descendants are always based on Reports To, never on roles.
CREATE OR REPLACE FUNCTION md_reporting_users(t uuid, subject uuid, direction text)
RETURNS TABLE(user_id uuid, hierarchy_level integer)
LANGUAGE sql STABLE AS $$
 WITH RECURSIVE chain(id,parent_id,depth,path) AS (
  SELECT u.id,u.reports_to_user_id,0,ARRAY[u.id]::uuid[]
  FROM md_users u WHERE u.tenant_id=t AND u.id=subject
  UNION ALL
  SELECT next.id,next.reports_to_user_id,c.depth+1,c.path||next.id
  FROM chain c JOIN md_users next ON next.tenant_id=t AND
   ((direction='descendants' AND next.reports_to_user_id=c.id)
    OR (direction='ancestors' AND next.id=c.parent_id))
  WHERE c.depth<512 AND NOT(next.id=ANY(c.path))
 )
 SELECT id,depth FROM chain WHERE direction IN ('descendants','ancestors');
$$;

CREATE OR REPLACE FUNCTION md_reporting_scope(t uuid, viewer uuid, target uuid, requested_scope text)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT CASE requested_scope
  WHEN 'all' THEN EXISTS(SELECT 1 FROM md_users WHERE tenant_id=t AND id=target)
  WHEN 'own' THEN viewer=target AND EXISTS(SELECT 1 FROM md_users WHERE tenant_id=t AND id=viewer)
  WHEN 'direct' THEN viewer=target OR EXISTS(
   SELECT 1 FROM md_users WHERE tenant_id=t AND id=target AND reports_to_user_id=viewer)
  WHEN 'descendants' THEN EXISTS(
   SELECT 1 FROM md_reporting_users(t,viewer,'descendants') WHERE user_id=target)
  ELSE false END;
$$;

CREATE OR REPLACE FUNCTION md_validate_reporting_manager()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE root_id uuid;
BEGIN
 -- Serialise edits within the tenant to avoid mutually concurrent reparenting cycles.
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text,19041));
 SELECT a.user_id INTO root_id
 FROM md_tenant_developer_accounts a WHERE a.tenant_id=NEW.tenant_id;
 IF root_id IS NOT NULL AND NEW.id=root_id THEN
  IF NEW.reports_to_user_id IS NOT NULL THEN
   RAISE EXCEPTION 'The tenant developer reporting root cannot have a manager';
  END IF;
  RETURN NEW;
 END IF;
 IF NEW.reports_to_user_id IS NULL THEN NEW.reports_to_user_id:=root_id; END IF;
 IF NEW.reports_to_user_id IS NULL THEN RETURN NEW; END IF;
 IF NEW.reports_to_user_id=NEW.id THEN RAISE EXCEPTION 'A user cannot report to themselves'; END IF;
 IF NOT EXISTS(SELECT 1 FROM md_users u WHERE u.tenant_id=NEW.tenant_id AND u.id=NEW.reports_to_user_id) THEN
  RAISE EXCEPTION 'Reporting manager must belong to the same tenant';
 END IF;
 IF TG_OP='UPDATE' AND EXISTS(
  SELECT 1 FROM md_reporting_users(NEW.tenant_id,NEW.id,'descendants')
  WHERE user_id=NEW.reports_to_user_id
 ) THEN RAISE EXCEPTION 'Circular reporting hierarchy'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS md_users_validate_reporting_manager ON md_users;
CREATE TRIGGER md_users_validate_reporting_manager
 BEFORE INSERT OR UPDATE OF reports_to_user_id ON md_users
 FOR EACH ROW EXECUTE FUNCTION md_validate_reporting_manager();

-- Existing users without a manager now report to the tenant developer.
-- Preserve explicitly assigned managers; developer is always the unique root.
UPDATE md_users u SET reports_to_user_id=a.user_id
FROM md_tenant_developer_accounts a
WHERE u.tenant_id=a.tenant_id AND u.id<>a.user_id AND u.reports_to_user_id IS NULL;
UPDATE md_users u SET reports_to_user_id=NULL
FROM md_tenant_developer_accounts a
WHERE u.tenant_id=a.tenant_id AND u.id=a.user_id AND u.reports_to_user_id IS NOT NULL;
