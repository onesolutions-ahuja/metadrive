import {seedIndependentAppMetadata,type AppSeedDefinition} from './app-metadata-seeder.js';
import type {SqlPersistence} from './sql-persistence.js';
export class AppRuntime {
  constructor(private readonly db:SqlPersistence,private readonly trustedAppSeed?: (appApi:string)=>Promise<AppSeedDefinition|undefined>) {}
  async install(tenantId:string,appApi:string) {
    await this.db.transaction(async client=>{
      const {rows}=await client.query<{id:string}>(`
        SELECT a.id FROM md_apps a JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1
        WHERE a.api_name=$2 AND a.enabled=true AND e.active=true
          AND (e.expires_at IS NULL OR e.expires_at>now()) FOR UPDATE OF e
      `,[tenantId,appApi]);
      if(!rows[0])throw new Error('App licence or entitlement unavailable');
      const missing=await client.query<{api_name:string}>(`
        SELECT required.api_name FROM md_app_dependencies d
        JOIN md_apps required ON required.id=d.dependency_app_id
        LEFT JOIN md_app_installations i ON i.tenant_id=$1 AND i.app_id=d.dependency_app_id
        LEFT JOIN md_app_entitlements e ON e.tenant_id=$1 AND e.app_id=d.dependency_app_id
        WHERE d.app_id=$2 AND (i.app_id IS NULL OR e.active IS DISTINCT FROM true
          OR e.expires_at<=now() OR required.enabled=false)`,[tenantId,rows[0].id]);
      if(missing.rows.length)throw new Error('Missing installed and entitled app dependencies: '+missing.rows.map(x=>x.api_name).join(', '));
      await client.query('INSERT INTO md_app_installations (tenant_id,app_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [tenantId,rows[0].id]);
      const packaged=await client.query<{version:number;manifest:AppSeedDefinition}>(`
       SELECT version,manifest FROM md_app_package_versions WHERE app_id=$1
       ORDER BY version DESC LIMIT 1`,[rows[0].id]);
      // Manifests come from versioned SQL app packages or trusted lazy server modules.
      const selected=packaged.rows[0];
      const seed=selected?.manifest??await this.trustedAppSeed?.(appApi);
      if(!seed)throw new Error('No trusted app package registered: '+appApi);
      const size=JSON.stringify(seed).length;
      if(size>262144||!seed||typeof seed!=='object'||Array.isArray(seed)
        ||Object.keys(seed).some(k=>!['objects','components','pages','flows','actions'].includes(k))
        ||Object.values(seed).some(v=>v!==undefined&&!Array.isArray(v)))
       throw new Error('Invalid app package manifest');
      await client.query('SELECT app_id FROM md_app_installations WHERE tenant_id=$1 AND app_id=$2 FOR UPDATE',
       [tenantId,rows[0].id]);
      await seedIndependentAppMetadata(client,tenantId,seed,rows[0].id);
      // Re-enable only metadata which this app's own uninstall previously disabled.
      await client.query(`UPDATE md_page_definitions p SET enabled=true
       FROM md_app_owned_definitions o
       WHERE o.tenant_id=$1 AND o.app_id=$2 AND o.kind='page' AND o.disabled_by_uninstall=true
        AND p.tenant_id=o.tenant_id AND p.api_name=o.api_name`,[tenantId,rows[0].id]);
      await client.query(`UPDATE md_component_definitions c SET enabled=true
       FROM md_app_owned_definitions o
       WHERE o.tenant_id=$1 AND o.app_id=$2 AND o.kind='component' AND o.disabled_by_uninstall=true
        AND c.tenant_id=o.tenant_id AND c.api_name=o.api_name`,[tenantId,rows[0].id]);
      await client.query(`UPDATE md_app_owned_definitions SET disabled_by_uninstall=false
       WHERE tenant_id=$1 AND app_id=$2 AND kind IN ('page','component')`,[tenantId,rows[0].id]);
      await client.query(`INSERT INTO md_app_installed_versions(tenant_id,app_id,version)
        VALUES($1,$2,$3) ON CONFLICT(tenant_id,app_id)
        DO UPDATE SET version=EXCLUDED.version,upgraded_at=now()`,
       [tenantId,rows[0].id,selected?.version??1]);
    });
  }
  async update(tenantId:string,appApi:string) { await this.install(tenantId,appApi); }
  async uninstall(tenantId:string,appApi:string) {
    await this.db.transaction(async client=>{
      const {rows:blocking}=await client.query<{api_name:string}>(`
       SELECT dependent.api_name FROM md_apps target
       JOIN md_app_dependencies d ON d.dependency_app_id=target.id
       JOIN md_apps dependent ON dependent.id=d.app_id
       JOIN md_app_installations i ON i.app_id=dependent.id AND i.tenant_id=$1
       WHERE target.api_name=$2`,[tenantId,appApi]);
      if(blocking.length)throw new Error('Cannot uninstall app required by: '+blocking.map(x=>x.api_name).join(', '));
      const {rows:target}=await client.query<{id:string}>(
       'SELECT id FROM md_apps WHERE api_name=$1',[appApi]);
      if(!target[0])throw Error('App not found');
      const appId=target[0].id;
      // Stop executable business logic and durable interviews without deleting records.
      await client.query(`UPDATE md_flow_runs r SET status='failed',error_code='app_uninstalled',finished_at=now()
       FROM md_flow_definitions f JOIN md_app_owned_definitions o
        ON o.tenant_id=f.tenant_id AND o.kind='flow' AND o.api_name=f.api_name
       WHERE r.tenant_id=$1 AND o.app_id=$2 AND r.flow_id=f.id
        AND r.tenant_id=f.tenant_id AND r.status='pending'`,[tenantId,appId]);
      await client.query(`UPDATE md_screen_interviews i SET status='cancelled',updated_at=now()
       FROM md_flow_definitions f JOIN md_app_owned_definitions o
        ON o.tenant_id=f.tenant_id AND o.kind='flow' AND o.api_name=f.api_name
       WHERE i.tenant_id=$1 AND o.app_id=$2 AND i.flow_id=f.id
        AND i.tenant_id=f.tenant_id AND i.status='waiting'`,[tenantId,appId]);
      await client.query(`UPDATE md_flow_definitions f SET active=false
       FROM md_app_owned_definitions o WHERE o.tenant_id=$1 AND o.app_id=$2
       AND o.kind='flow' AND o.api_name=f.api_name AND f.tenant_id=$1
       AND f.active=true`,[tenantId,appId]);
      await client.query(`UPDATE md_app_owned_definitions o SET disabled_by_uninstall=true
       FROM md_page_definitions p WHERE o.tenant_id=$1 AND o.app_id=$2 AND o.kind='page'
       AND p.tenant_id=o.tenant_id AND p.api_name=o.api_name AND p.enabled=true`,[tenantId,appId]);
      await client.query(`UPDATE md_page_definitions p SET enabled=false
       FROM md_app_owned_definitions o WHERE o.tenant_id=$1 AND o.app_id=$2 AND o.kind='page'
       AND p.tenant_id=o.tenant_id AND p.api_name=o.api_name AND o.disabled_by_uninstall=true`,
       [tenantId,appId]);
      await client.query(`UPDATE md_app_owned_definitions o SET disabled_by_uninstall=true
       FROM md_component_definitions c WHERE o.tenant_id=$1 AND o.app_id=$2 AND o.kind='component'
       AND c.tenant_id=o.tenant_id AND c.api_name=o.api_name AND c.enabled=true
       AND NOT EXISTS(SELECT 1 FROM md_page_components pc WHERE pc.tenant_id=$1
        AND pc.component_api=c.api_name
        AND NOT EXISTS(SELECT 1 FROM md_app_owned_definitions op
         JOIN md_page_definitions p ON p.tenant_id=op.tenant_id AND p.api_name=op.api_name
         WHERE op.tenant_id=$1 AND op.app_id=$2 AND op.kind='page' AND p.id=pc.page_id))`,
       [tenantId,appId]);
      await client.query(`UPDATE md_component_definitions c SET enabled=false
       FROM md_app_owned_definitions o WHERE o.tenant_id=$1 AND o.app_id=$2
       AND o.kind='component' AND o.disabled_by_uninstall=true
       AND c.tenant_id=o.tenant_id AND c.api_name=o.api_name`,[tenantId,appId]);
      await client.query(`DELETE FROM md_app_home_pages WHERE tenant_id=$1
        AND app_id IN (SELECT id FROM md_apps WHERE api_name=$2)`,[tenantId,appApi]);
      await client.query('DELETE FROM md_app_installations WHERE tenant_id=$1 AND app_id IN (SELECT id FROM md_apps WHERE api_name=$2)',
        [tenantId,appApi]);
    });
  }
  async homePage(tenantId:string,appApi:string,formFactor:string) {
    // A URL cannot reveal pages for uninstalled, disabled or unlicensed apps.
    const {rows}=await this.db.query<{api_name:string}>(`
      SELECT p.api_name FROM md_apps a
      JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
      JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1
      LEFT JOIN md_app_home_pages h ON h.tenant_id=$1 AND h.app_id=a.id
        AND h.form_factor=$3
      LEFT JOIN md_page_definitions p ON p.id=h.page_id AND p.tenant_id=$1 AND p.enabled=true
      WHERE a.api_name=$2 AND a.enabled=true
        AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
    `,[tenantId,appApi,formFactor]);
    if(!rows.length)throw new Error('Permission denied');
    return rows[0].api_name?{apiName:rows[0].api_name}:null;
  }
  async listInstalled(tenantId:string) {
    const {rows}=await this.db.query<{api_name:string;label:string}>(`
      SELECT a.api_name,a.label FROM md_apps a
      JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
      JOIN md_app_entitlements e ON e.tenant_id=i.tenant_id AND e.app_id=a.id
      WHERE a.enabled=true AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
      ORDER BY a.label
    `,[tenantId]);
    return rows.map(x=>({apiName:x.api_name,label:x.label}));
  }
}
