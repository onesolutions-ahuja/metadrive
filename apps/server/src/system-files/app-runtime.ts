import type {SqlPersistence} from './sql-persistence.js';
export class AppRuntime {
  constructor(private readonly db:SqlPersistence) {}
  async install(tenantId:string,appApi:string,seed?:import('../system-support/app-page-seeder.js').AppPageSeed) {
    await this.db.transaction(async client=>{
      const {rows}=await client.query<{id:string}>(`
        SELECT a.id FROM md_apps a JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1
        WHERE a.api_name=$2 AND a.enabled=true AND e.active=true
          AND (e.expires_at IS NULL OR e.expires_at>now()) FOR UPDATE OF e
      `,[tenantId,appApi]);
      if(!rows[0])throw new Error('App licence or entitlement unavailable');
      await client.query('INSERT INTO md_app_installations (tenant_id,app_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [tenantId,rows[0].id]);
      if(seed){const {seedAppPage}=await import('../system-support/app-page-seeder.js');await seedAppPage(client,tenantId,rows[0].id,seed);}
    });
  }
  /** Tenant app entitlement is explicit, separate from installation and RBAC. */
  async grantLicence(tenantId:string,userId:string,appApi:string) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(appApi))throw new Error('Invalid app licence');
    await this.db.transaction(async client=>{
      const {rows}=await client.query<{id:string}>(
        'SELECT id FROM md_apps WHERE api_name=$1 AND enabled=true FOR SHARE',[appApi]);
      if(!rows[0])throw new Error('App not found');
      await client.query(`
        INSERT INTO md_app_entitlements(tenant_id,app_id,active,expires_at)
        VALUES($1,$2,true,NULL)
        ON CONFLICT(tenant_id,app_id) DO UPDATE
        SET active=true,expires_at=NULL`,[tenantId,rows[0].id]);
      await client.query("INSERT INTO md_security_events(tenant_id,actor_user_id,action,details) VALUES($1,$2,'app.licence.grant',jsonb_build_object('appApi',$3::text))",
        [tenantId,userId,appApi]);
    });
    return {appApi,licensed:true};
  }
  async uninstall(tenantId:string,appApi:string) {
    await this.db.transaction(async client=>{
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
  async marketplace(tenantId:string) {
    const {rows}=await this.db.query<{
      id:string;api_name:string;label:string;installed:boolean;expires_at:Date|null;licensed:boolean
    }>(`
      SELECT a.id,a.api_name,a.label,(i.app_id IS NOT NULL) AS installed,
        e.expires_at,(COALESCE(e.active,false) AND
          (e.expires_at IS NULL OR e.expires_at>now())) AS licensed
      FROM md_apps a
      LEFT JOIN md_app_installations i ON i.tenant_id=$1 AND i.app_id=a.id
      LEFT JOIN md_app_entitlements e ON e.tenant_id=$1 AND e.app_id=a.id
      WHERE a.enabled=true
      ORDER BY a.label
    `,[tenantId]);
    return {records:rows.map(row=>({
      Id:row.id,Name:row.label,AppKey__c:row.api_name,
      CredentialName__c:'',Installed__c:row.installed,
      LicenceStatus__c:row.licensed?'ACTIVE':'UNLICENSED',
      ...(row.expires_at?{LicenceExpiresAt__c:new Date(row.expires_at).toISOString()}:{})
    }))};
  }
  /** Tenant app route aliases are independently versioned SQL metadata. */
  async listAliases(tenantId:string){
    const {rows}=await this.db.query<{
      app_api:string;slug:string;kind:string;target_api:string;status:string;version:number
    }>(`
      SELECT r.app_api,r.slug,r.kind,r.target_api,r.status,r.version
      FROM md_app_route_aliases r
      JOIN md_apps a ON a.api_name=r.app_api
      JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=r.tenant_id
      WHERE r.tenant_id=$1 ORDER BY r.app_api,r.slug
    `,[tenantId]);
    return {aliases:rows.map(r=>({
      appId:r.app_api,slug:r.slug,kind:r.kind,
      targetApiName:r.target_api,status:r.status,version:r.version
    }))};
  }
  async saveAlias(tenantId:string,appApi:string,slug:string,input:Record<string,unknown>){
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(appApi)|| !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/.test(slug))
      throw new Error('Invalid route alias');
    const kind=input.kind,target=input.targetApiName,expected=input.expectedVersion;
    if(input.appId!==appApi||input.slug!==slug||
      !['App Home','App Page','Record List'].includes(String(kind))||
      typeof target!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(target)||
      !Number.isSafeInteger(expected)||Number(expected)<0)
      throw new Error('Invalid route alias');
    if(kind==='App Home'&&target!==appApi)throw new Error('Invalid App Home destination');
    const {rows:install}=await this.db.query<{id:string}>(`
      SELECT a.id FROM md_apps a
      JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
      JOIN md_app_entitlements e ON e.tenant_id=$1 AND e.app_id=a.id
      WHERE a.api_name=$2 AND a.enabled=true AND e.active=true
        AND (e.expires_at IS NULL OR e.expires_at>now())
    `,[tenantId,appApi]);
    if(!install.length)throw new Error('App not installed or licensed');
    if(kind!=='App Home'){
      const query=kind==='App Page'
        ? 'SELECT id FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true'
        : 'SELECT id FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2';
      const found=await this.db.query(query,[tenantId,target]);
      if(!found.rows.length)throw new Error('Route alias destination unavailable');
    }
    const version=Number(expected);
    const {rows}=await this.db.query<{version:number}>(version===0?`
      INSERT INTO md_app_route_aliases(tenant_id,app_api,slug,kind,target_api,status,version)
      VALUES($1,$2,$3,$4,$5,'Active',1)
      ON CONFLICT(tenant_id,app_api,slug) DO NOTHING RETURNING version
    `:`
      UPDATE md_app_route_aliases
      SET kind=$4,target_api=$5,status='Active',version=version+1,updated_at=now()
      WHERE tenant_id=$1 AND app_api=$2 AND slug=$3 AND version=$6
      RETURNING version
    `,version===0?[tenantId,appApi,slug,kind,target]:[tenantId,appApi,slug,kind,target,version]);
    if(!rows.length)throw new Error('Route alias version conflict');
    return {appId:appApi,slug,kind,targetApiName:target,status:'Active',version:rows[0].version};
  }
  async disableAlias(tenantId:string,appApi:string,slug:string,expectedVersion:unknown){
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(appApi)||
      !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/.test(slug)||
      !Number.isSafeInteger(expectedVersion)||Number(expectedVersion)<1)
      throw new Error('Invalid route alias');
    const {rowCount}=await this.db.query(`
      UPDATE md_app_route_aliases
      SET status='Disabled',version=version+1,updated_at=now()
      WHERE tenant_id=$1 AND app_api=$2 AND slug=$3 AND version=$4 AND status='Active'
    `,[tenantId,appApi,slug,expectedVersion]);
    if(!rowCount)throw new Error('Route alias version conflict');
  }
  async resolveAlias(tenantId:string,appApi:string,slug:string){
    const {rows}=await this.db.query<{kind:string;target_api:string}>(`
      SELECT r.kind,r.target_api FROM md_app_route_aliases r
      JOIN md_apps a ON a.api_name=r.app_api
      JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=r.tenant_id
      JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=r.tenant_id
      WHERE r.tenant_id=$1 AND r.app_api=$2 AND r.slug=$3 AND r.status='Active'
        AND a.enabled=true AND e.active=true
        AND (e.expires_at IS NULL OR e.expires_at>now())
    `,[tenantId,appApi,slug]);
    const record=rows[0];
    if(!record)throw new Error('Route alias unavailable');
    const target=record.target_api;
    if(record.kind!=='App Home'){
      const sql=record.kind==='App Page'
        ? 'SELECT 1 FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true'
        : 'SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2';
      const result=await this.db.query(sql,[tenantId,target]);
      if(!result.rows.length)throw new Error('Route alias destination unavailable');
    }
    const app=encodeURIComponent(appApi),api=encodeURIComponent(target);
    if(record.kind==='App Home')return {path:'/une/apps/'+app+'/home',kind:record.kind,targetApiName:target};
    if(record.kind==='App Page')return {path:'/une/apps/'+app+'/pages/'+api,kind:record.kind,targetApiName:target};
    if(record.kind==='Record List'){
      const q=new URLSearchParams({filterName:'All'+target+'s',appId:appApi});
      return {path:'/une/o/'+api+'/list?'+q.toString(),kind:record.kind,targetApiName:target};
    }
    throw new Error('Invalid route alias destination');
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
