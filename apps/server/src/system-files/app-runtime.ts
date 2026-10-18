import type {SqlPersistence} from './sql-persistence.js';
export class AppRuntime {
  constructor(private readonly db:SqlPersistence) {}
  /** Metadata for installed and entitled apps only, including tenant-owned apps. */
  async listMetadata(tenantId:string) {
    const {rows}=await this.db.query<{
      id:string;api_name:string;label:string;description:string|null;brand_color:string|null;revision:number|null
    }>(`
      SELECT a.id,COALESCE(m.api_name,a.api_name) AS api_name,
        COALESCE(m.label,a.label) AS label,m.description,m.brand_color,m.revision
      FROM md_apps a
      JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
      JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1
      LEFT JOIN md_tenant_app_metadata m ON m.app_id=a.id AND m.tenant_id=$1
      WHERE a.enabled=true AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)
        AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
      ORDER BY COALESCE(m.label,a.label),COALESCE(m.api_name,a.api_name)
    `,[tenantId]);
    if(!rows.length)return [];
    const [navigation,utilities]=await Promise.all([
      this.db.query<{app_id:string;entry_type:'Object'|'App Page';api_name:string;sort_order:number}>(`
        SELECT app_id,entry_type,api_name,sort_order FROM md_tenant_app_navigation
        WHERE tenant_id=$1 AND app_id=ANY($2::uuid[]) ORDER BY sort_order
      `,[tenantId,rows.map(row=>row.id)]),
      this.db.query<{app_id:string;utility_name:'Notes'|'History'}>(`
        SELECT app_id,utility_name FROM md_tenant_app_utilities
        WHERE tenant_id=$1 AND app_id=ANY($2::uuid[]) ORDER BY sort_order
      `,[tenantId,rows.map(row=>row.id)])
    ]);
    return rows.map(row=>{
      const entries=navigation.rows.filter(item=>item.app_id===row.id)
        .map(item=>({type:item.entry_type,apiName:item.api_name}));
      return {apiName:row.api_name,label:row.label,description:row.description??'',
        navigationItems:entries.filter(item=>item.type==='Object').map(item=>item.apiName),
        navigationPageApiNames:entries.filter(item=>item.type==='App Page').map(item=>item.apiName),
        navigationOrder:entries,brandColor:row.brand_color??'#1d4ed8',
        utilityItems:utilities.rows.filter(item=>item.app_id===row.id).map(item=>item.utility_name),
        ...(row.revision===null?{}:{revision:row.revision})};
    });
  }
  /** Tenant-owned app authoring; catalog identity, licence and installation remain separate. */
  async saveMetadata(tenantId:string,apiName:string,raw:unknown,updating:boolean) {
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid App metadata');
    const p=raw as Record<string,unknown>;
    if(p.apiName!==apiName||!/^[A-Za-z][A-Za-z0-9_]*$/.test(apiName)
      ||typeof p.label!=='string'||!p.label.trim()||p.label.length>200
      ||typeof p.description!=='string'||p.description.length>4000
      ||typeof p.brandColor!=='string'||!/^#[0-9a-fA-F]{6}$/.test(p.brandColor)
      ||!Array.isArray(p.navigationItems)||!Array.isArray(p.navigationPageApiNames)
      ||!Array.isArray(p.navigationOrder)||!Array.isArray(p.utilityItems)
      ||p.navigationItems.length>100||p.navigationPageApiNames.length>100
      ||p.navigationOrder.length>200||p.utilityItems.length>2)
      throw new Error('Invalid App metadata');
    const objects=p.navigationItems as unknown[],pages=p.navigationPageApiNames as unknown[];
    if([...objects,...pages].some(name=>typeof name!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)))
      throw new Error('Invalid App navigation');
    if(new Set(objects).size!==objects.length||new Set(pages).size!==pages.length)
      throw new Error('Duplicate App navigation');
    const allowed=new Set<string>([
      ...objects.map(name=>'Object:'+name),
      ...pages.map(name=>'App Page:'+name)
    ]);
    const order:Array<{type:'Object'|'App Page';apiName:string}>=[];
    const chosen=new Set<string>();
    for(const rawEntry of p.navigationOrder as unknown[]){
      if(!rawEntry||typeof rawEntry!=='object'||Array.isArray(rawEntry))
        throw new Error('Invalid App navigation');
      const item=rawEntry as Record<string,unknown>;
      const key=item.type+':'+item.apiName;
      if(!allowed.has(key)||chosen.has(key))throw new Error('Invalid App navigation order');
      chosen.add(key);
      order.push({type:item.type as 'Object'|'App Page',apiName:item.apiName as string});
    }
    for(const key of allowed)if(!chosen.has(key)){
      const type=key.startsWith('Object:')?'Object':'App Page';
      order.push({type,apiName:key.slice(type.length+1)});
    }
    const utilityItems=p.utilityItems as unknown[];
    if(utilityItems.some(item=>item!=='Notes'&&item!=='History')||
      new Set(utilityItems).size!==utilityItems.length)
      throw new Error('Invalid App utilities');
    await this.db.transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',
        [tenantId+':app:'+apiName]);
      let appId:string;
      if(updating){
        const {rows}=await client.query<{app_id:string;revision:number|null}>(`
          SELECT a.id AS app_id,m.revision FROM md_apps a
          JOIN md_app_installations i ON i.tenant_id=$1 AND i.app_id=a.id
          JOIN md_app_entitlements e ON e.tenant_id=$1 AND e.app_id=a.id
          LEFT JOIN md_tenant_app_metadata m ON m.tenant_id=$1 AND m.app_id=a.id
          WHERE COALESCE(m.api_name,a.api_name)=$2
            AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)
            AND a.enabled=true AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
          FOR UPDATE OF a`,[tenantId,apiName]);
        if(!rows[0])throw new Error('App not installed or licensed');
        appId=rows[0].app_id;
        if(p.revision!==undefined&&p.revision!==rows[0].revision)
          throw new Error('App revision conflict');
      }else{
        const collision=await client.query(`
          SELECT 1 FROM md_apps a
          LEFT JOIN md_tenant_app_metadata m ON m.tenant_id=$1 AND m.app_id=a.id
          WHERE (a.tenant_owner_id=$1 OR a.tenant_owner_id IS NULL)
            AND COALESCE(m.api_name,a.api_name)=$2 AND a.enabled=true
        `,[tenantId,apiName]);
        if(collision.rowCount)throw new Error('App already exists');
        const internalKey='Tenant_'+tenantId.replace(/-/g,'')+'_'+apiName;
        const {rows}=await client.query<{id:string}>(`
          INSERT INTO md_apps(api_name,label,enabled,tenant_owner_id)
          VALUES($1,$2,true,$3) RETURNING id`,[internalKey,p.label,tenantId]);
        appId=rows[0].id;
        // A newly authored tenant App receives its own entitlement and installation.
        await client.query(`
          INSERT INTO md_app_entitlements(tenant_id,app_id,active)
          VALUES($1,$2,true)`,[tenantId,appId]);
        await client.query(`
          INSERT INTO md_app_installations(tenant_id,app_id) VALUES($1,$2)`,
          [tenantId,appId]);
      }
      for(const objectApi of objects){
        const found=await client.query(
          'SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',
          [tenantId,objectApi]);
        if(!found.rowCount)throw new Error('Unknown App Object: '+objectApi);
      }
      for(const pageApi of pages){
        const found=await client.query(
          'SELECT 1 FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true',
          [tenantId,pageApi]);
        if(!found.rowCount)throw new Error('Unknown App Page: '+pageApi);
      }
      await client.query(`
        INSERT INTO md_tenant_app_metadata(tenant_id,app_id,api_name,label,description,brand_color,revision)
        VALUES($1,$2,$3,$4,$5,$6,1)
        ON CONFLICT(tenant_id,app_id) DO UPDATE SET label=EXCLUDED.label,
          description=EXCLUDED.description,brand_color=EXCLUDED.brand_color,
          revision=md_tenant_app_metadata.revision+1
      `,[tenantId,appId,apiName,p.label,p.description,p.brandColor]);
      await client.query('DELETE FROM md_tenant_app_navigation WHERE tenant_id=$1 AND app_id=$2',[tenantId,appId]);
      await client.query('DELETE FROM md_tenant_app_utilities WHERE tenant_id=$1 AND app_id=$2',[tenantId,appId]);
      for(const [position,item] of order.entries())await client.query(`
        INSERT INTO md_tenant_app_navigation(tenant_id,app_id,entry_type,api_name,sort_order)
        VALUES($1,$2,$3,$4,$5)`,[tenantId,appId,item.type,item.apiName,position]);
      for(const [position,item] of utilityItems.entries())await client.query(`
        INSERT INTO md_tenant_app_utilities(tenant_id,app_id,utility_name,sort_order)
        VALUES($1,$2,$3,$4)`,[tenantId,appId,item,position]);
    });
    const found=(await this.listMetadata(tenantId)).find(item=>item.apiName===apiName);
    if(!found)throw new Error('Saved App unavailable');
    return found;
  }
  private async catalogApi(tenantId:string,publicName:string) {
    const {rows}=await this.db.query<{api_name:string}>(`
      SELECT a.api_name FROM md_apps a
      JOIN md_app_installations i ON i.tenant_id=$1 AND i.app_id=a.id
      JOIN md_app_entitlements e ON e.tenant_id=$1 AND e.app_id=a.id
      LEFT JOIN md_tenant_app_metadata m ON m.tenant_id=$1 AND m.app_id=a.id
      WHERE COALESCE(m.api_name,a.api_name)=$2 AND a.enabled=true
        AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)
        AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
    `,[tenantId,publicName]);
    if(!rows[0])throw new Error('App not installed or licensed');
    return rows[0].api_name;
  }

  async install(tenantId:string,appApi:string,seed?:import('../system-support/app-page-seeder.js').AppPageSeed) {
    await this.db.transaction(async client=>{
      const {rows}=await client.query<{id:string}>(`
        SELECT a.id FROM md_apps a
        JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1
        LEFT JOIN md_tenant_app_metadata m ON m.tenant_id=$1 AND m.app_id=a.id
        WHERE COALESCE(m.api_name,a.api_name)=$2 AND a.enabled=true AND e.active=true
          AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)
          AND (e.expires_at IS NULL OR e.expires_at>now()) FOR UPDATE OF e
      `,[tenantId,appApi]);
      if(!rows[0])throw new Error('App licence or entitlement unavailable');
      await client.query('INSERT INTO md_app_installations (tenant_id,app_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [tenantId,rows[0].id]);
      if(seed){const {seedAppPage}=await import('../system-support/app-page-seeder.js');await seedAppPage(client,tenantId,rows[0].id,seed);}
    });
  }
  async uninstall(tenantId:string,appApi:string) {
    const catalog=await this.catalogApi(tenantId,appApi);
    await this.db.transaction(async client=>{
      await client.query(`DELETE FROM md_app_home_pages WHERE tenant_id=$1
        AND app_id IN (SELECT id FROM md_apps WHERE api_name=$2)`,[tenantId,catalog]);
      await client.query('DELETE FROM md_app_installations WHERE tenant_id=$1 AND app_id IN (SELECT id FROM md_apps WHERE api_name=$2)',
        [tenantId,catalog]);
    });
  }
  async homePage(tenantId:string,appApi:string,formFactor:string,profileId='') {
    const {rows}=await this.db.query<{api_name:string|null}>(`
      SELECT COALESCE(home.api_name,p.api_name) AS api_name FROM md_apps a
      JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
      JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1
      LEFT JOIN md_tenant_app_metadata m ON m.app_id=a.id AND m.tenant_id=$1
      LEFT JOIN md_app_home_pages h ON h.tenant_id=$1 AND h.app_id=a.id AND h.form_factor=$3
      LEFT JOIN md_page_definitions p ON p.id=h.page_id AND p.tenant_id=$1 AND p.enabled=true
      LEFT JOIN LATERAL (
        SELECT hp.api_name FROM md_lightning_page_activation x
        JOIN md_lightning_page_details d ON d.tenant_id=x.tenant_id AND d.page_id=x.page_id
        JOIN md_page_definitions hp ON hp.tenant_id=d.tenant_id AND hp.id=d.page_id
        WHERE x.tenant_id=$1 AND x.app_api=$2 AND d.status='Active'
          AND d.page_type='Home Page' AND hp.enabled=true
          AND ((x.scope='App Default') OR (x.scope='App and Profile' AND x.profile_id=$4))
          AND (($3='desktop' AND x.desktop) OR ($3='phone' AND x.phone))
        ORDER BY CASE x.scope WHEN 'App and Profile' THEN 2 ELSE 1 END DESC,
          d.updated_at DESC LIMIT 1
      ) home ON true
      WHERE COALESCE(m.api_name,a.api_name)=$2 AND a.enabled=true
        AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)
        AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
    `,[tenantId,appApi,formFactor,profileId]);
    if(!rows.length)throw new Error('Permission denied');
    return rows[0].api_name?{apiName:rows[0].api_name}:null;
  }
  async marketplace(tenantId:string) {
    const {rows}=await this.db.query<{
      id:string;api_name:string;label:string;installed:boolean;expires_at:Date|null;licensed:boolean
    }>(`
      SELECT a.id,COALESCE(m.api_name,a.api_name) AS api_name,COALESCE(m.label,a.label) AS label,
        (i.app_id IS NOT NULL) AS installed,
        e.expires_at,(COALESCE(e.active,false) AND
          (e.expires_at IS NULL OR e.expires_at>now())) AS licensed
      FROM md_apps a
      LEFT JOIN md_app_installations i ON i.tenant_id=$1 AND i.app_id=a.id
      LEFT JOIN md_app_entitlements e ON e.tenant_id=$1 AND e.app_id=a.id
      LEFT JOIN md_tenant_app_metadata m ON m.tenant_id=$1 AND m.app_id=a.id
      WHERE a.enabled=true AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)
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
      SELECT COALESCE(m.api_name,r.app_api) AS app_api,r.slug,r.kind,r.target_api,r.status,r.version
      FROM md_app_route_aliases r
      JOIN md_apps a ON a.api_name=r.app_api
      JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=r.tenant_id
      LEFT JOIN md_tenant_app_metadata m ON m.app_id=a.id AND m.tenant_id=r.tenant_id
      WHERE r.tenant_id=$1 AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=$1)
      ORDER BY app_api,r.slug
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
    const catalog=await this.catalogApi(tenantId,appApi);
    const {rows:install}=await this.db.query<{id:string}>(`
      SELECT a.id FROM md_apps a
      JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
      JOIN md_app_entitlements e ON e.tenant_id=$1 AND e.app_id=a.id
      WHERE a.api_name=$2 AND a.enabled=true AND e.active=true
        AND (e.expires_at IS NULL OR e.expires_at>now())
    `,[tenantId,catalog]);
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
    `,version===0?[tenantId,catalog,slug,kind,target]:[tenantId,catalog,slug,kind,target,version]);
    if(!rows.length)throw new Error('Route alias version conflict');
    return {appId:appApi,slug,kind,targetApiName:target,status:'Active',version:rows[0].version};
  }
  async disableAlias(tenantId:string,appApi:string,slug:string,expectedVersion:unknown){
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(appApi)||
      !/^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/.test(slug)||
      !Number.isSafeInteger(expectedVersion)||Number(expectedVersion)<1)
      throw new Error('Invalid route alias');
    const catalog=await this.catalogApi(tenantId,appApi);
    const {rowCount}=await this.db.query(`
      UPDATE md_app_route_aliases
      SET status='Disabled',version=version+1,updated_at=now()
      WHERE tenant_id=$1 AND app_api=$2 AND slug=$3 AND version=$4 AND status='Active'
    `,[tenantId,catalog,slug,expectedVersion]);
    if(!rowCount)throw new Error('Route alias version conflict');
  }
  async resolveAlias(tenantId:string,appApi:string,slug:string){
    const catalog=await this.catalogApi(tenantId,appApi);
    const {rows}=await this.db.query<{kind:string;target_api:string}>(`
      SELECT r.kind,r.target_api FROM md_app_route_aliases r
      JOIN md_apps a ON a.api_name=r.app_api
      JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=r.tenant_id
      JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=r.tenant_id
      WHERE r.tenant_id=$1 AND r.app_api=$2 AND r.slug=$3 AND r.status='Active'
        AND a.enabled=true AND e.active=true
        AND (e.expires_at IS NULL OR e.expires_at>now())
    `,[tenantId,catalog,slug]);
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
    return this.listMetadata(tenantId);
  }
}
