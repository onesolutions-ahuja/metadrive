-- A disabled developer@tenant cannot write Communication: md_rbac_decision requires
-- enabled users. Provide an explicitly permissioned, tenant-scoped, non-login
-- system actor for central external communication delivery.
CREATE TABLE IF NOT EXISTS md_communication_logger_accounts (
 tenant_id uuid PRIMARY KEY REFERENCES md_tenants(id) ON DELETE CASCADE,
 user_id uuid NOT NULL,
 UNIQUE (tenant_id,user_id),
 FOREIGN KEY (tenant_id,user_id) REFERENCES md_users(tenant_id,id)
);

CREATE OR REPLACE FUNCTION md_ensure_communication_logger(t uuid)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE actor uuid; policy uuid;
BEGIN
 PERFORM 1 FROM md_tenants WHERE id=t;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tenant not found for Communication logger'; END IF;
 SELECT user_id INTO actor FROM md_communication_logger_accounts
 WHERE tenant_id=t FOR UPDATE;
 IF actor IS NULL THEN
  -- Not a login identity: invalid password format and permanent login lock.
  -- A collision must abort installation rather than grant rights to a real user.
  INSERT INTO md_users(tenant_id,email,password_hash,display_name,enabled,locked_until,user_type)
  VALUES(t,'onesys-communication-logger@system.invalid','!no-interactive-login!',
   'Communication Logger',true,'infinity'::timestamptz,'internal')
  RETURNING id INTO actor;
  INSERT INTO md_communication_logger_accounts(tenant_id,user_id)
  VALUES(t,actor);
 ELSE
  UPDATE md_users SET enabled=true,locked_until='infinity'::timestamptz,
   password_hash='!no-interactive-login!'
  WHERE tenant_id=t AND id=actor;
 END IF;
 INSERT INTO md_permission_sets(tenant_id,api_name)
 VALUES(t,'OneSysCommunicationWriter')
 ON CONFLICT(tenant_id,api_name) DO NOTHING;
 SELECT id INTO policy FROM md_permission_sets
 WHERE tenant_id=t AND api_name='OneSysCommunicationWriter';
 INSERT INTO md_permission_assignments(tenant_id,user_id,permission_set_id)
 VALUES(t,actor,policy) ON CONFLICT DO NOTHING;
 INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
 VALUES(t,policy,'Communication','create','allow')
 ON CONFLICT DO NOTHING;
 INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
 SELECT t,policy,'Communication.'||field,'create','allow'
 FROM unnest(ARRAY[
  'OwnerId','Name','Channel','Direction','Status','Sender','Recipient',
  'Subject','Body','ExternalMessageId','ConversationId','Provider',
  'RelatedObject','RelatedRecordId','SentAt','ReceivedAt','ErrorMessage'
 ]) AS field
 ON CONFLICT DO NOTHING;
 RETURN actor;
END;
$$;

-- Upgrade existing tenants without modifying business records or developer identities.
DO $$
DECLARE tenant uuid;
BEGIN
 FOR tenant IN SELECT id FROM md_tenants ORDER BY id LOOP
  PERFORM md_ensure_communication_logger(tenant);
 END LOOP;
END;
$$;
