import type {PoolClient} from 'pg';
import type {SqlPersistence} from '../system-files/sql-persistence.js';

export const ACETILL_EDITOR_PAGE='AcetillRegisterEditable';

/**
 * Add a draft-only visual editing entry for installed, entitled Acetill tenants.
 * The original AcetillRegister page and React app are never modified.
 * Existing tenant Page Builder definitions are never overwritten.
 */
export async function seedAcetillEditablePage(client:Pick<PoolClient,'query'>,tenantId:string){
 const {rows}=await client.query<{id:string}>(`
   SELECT a.id FROM md_apps a
   JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
   JOIN md_app_entitlements e ON e.tenant_id=i.tenant_id AND e.app_id=i.app_id
   WHERE a.api_name='Acetill' AND a.enabled=true AND e.active=true
     AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)
     AND (e.expires_at IS NULL OR e.expires_at>now()) LIMIT 1`,[tenantId]);
 if(!rows[0])return false;
 await client.query(`INSERT INTO md_page_definitions(tenant_id,api_name,title,enabled)
   VALUES($1,$2,'Acetill Terminal (Editable Copy)',true)
   ON CONFLICT(tenant_id,api_name) DO NOTHING`,[tenantId,ACETILL_EDITOR_PAGE]);
 await client.query(`INSERT INTO md_lightning_page_details
   (tenant_id,page_id,page_type,target_object,layout_mode,template,canvas_width,canvas_height,status,devices,revision)
   SELECT p.tenant_id,p.id,'App Page','','template','main-sidebar',1440,900,'Draft',ARRAY['Desktop','Phone']::text[],1
   FROM md_page_definitions p
   WHERE p.tenant_id=$1 AND p.api_name=$2 AND p.enabled=true
   ON CONFLICT(tenant_id,page_id) DO NOTHING`,[tenantId,ACETILL_EDITOR_PAGE]);
 return true;
}

/** Backfill only installed, licensed tenants at startup, without installing apps. */
export async function backfillAcetillEditablePages(db:SqlPersistence){
 const {rows}=await db.query<{tenant_id:string}>(`
  SELECT DISTINCT i.tenant_id FROM md_app_installations i
  JOIN md_apps a ON a.id=i.app_id AND a.api_name='Acetill' AND a.enabled=true
  JOIN md_app_entitlements e ON e.tenant_id=i.tenant_id AND e.app_id=i.app_id
  WHERE e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())`);
 for(const row of rows)await db.transaction(client=>seedAcetillEditablePage(client,row.tenant_id));
 return rows.length;
}
