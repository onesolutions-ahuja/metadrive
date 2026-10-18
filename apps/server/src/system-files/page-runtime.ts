import {expandAppProperties} from '../system-support/app-page-seeder.js';
import type { SqlPersistence } from './sql-persistence.js';
export class PageRuntime {
  constructor(private readonly db:SqlPersistence) {}

  async listAliases(tenantId:string) {
    const {rows}=await this.db.query<{app_api:string;slug:string;kind:string;target_api:string;enabled:boolean;version:number}>(`
      SELECT ra.app_api,ra.slug,ra.kind,ra.target_api,ra.enabled,ra.version
      FROM md_route_aliases ra JOIN md_apps a ON a.api_name=ra.app_api AND a.enabled=true
      JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=ra.tenant_id
      JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=ra.tenant_id
      WHERE ra.tenant_id=$1 AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
      ORDER BY ra.app_api,ra.slug
    `,[tenantId]);
    return {aliases:rows.map(r=>({appId:r.app_api,slug:r.slug,kind:r.kind,
      targetApiName:r.target_api,status:r.enabled?'Active':'Disabled',version:r.version}))};
  }
  async saveAlias(tenantId:string,userId:string,appId:string,slug:string,input:unknown) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(appId)||!/^[a-z][a-z0-9-]{0,62}$/.test(slug))
      throw new Error('Invalid route alias');
    if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid route alias');
    const value=input as Record<string,unknown>;
    const kind=value.kind, target=value.targetApiName;
    const expected=value.expectedVersion;
    if(value.appId!==appId||value.slug!==slug||
      !['App Home','App Page','Record List'].includes(String(kind))||
      typeof target!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(target)||
      !Number.isSafeInteger(expected)||Number(expected)<0||
      (kind==='App Home'&&target!==appId))
      throw new Error('Invalid route alias configuration');
    const revision=Number(expected);
    return this.db.transaction(async client=>{
      const app=await client.query<{id:string}>(`
        SELECT a.id FROM md_apps a
        JOIN md_app_installations i ON i.app_id=a.id AND i.tenant_id=$1
        JOIN md_app_entitlements e ON e.app_id=a.id AND e.tenant_id=$1
        WHERE a.api_name=$2 AND a.enabled=true AND e.active=true
          AND (e.expires_at IS NULL OR e.expires_at>now()) FOR UPDATE OF i
      `,[tenantId,appId]);
      if(!app.rows[0])throw new Error('App is not installed and licensed');
      if(kind==='App Page'){
        const found=await client.query('SELECT id FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true',[tenantId,target]);
        if(!found.rowCount)throw new Error('App page is not active');
      }
      if(kind==='Record List'){
        const found=await client.query('SELECT id FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',[tenantId,target]);
        if(!found.rowCount)throw new Error('Record object not found');
      }
      const current=await client.query<{version:number}>(`
        SELECT version FROM md_route_aliases WHERE tenant_id=$1 AND app_api=$2 AND slug=$3 FOR UPDATE
      `,[tenantId,appId,slug]);
      if(Number(current.rows[0]?.version??0)!==revision)throw new Error('Route alias version conflict');
      const result=await client.query<{version:number}>(`
        INSERT INTO md_route_aliases(tenant_id,app_api,slug,kind,target_api,version,enabled,updated_at)
        VALUES($1,$2,$3,$4,$5,1,true,now())
        ON CONFLICT(tenant_id,app_api,slug) DO UPDATE SET
          kind=EXCLUDED.kind,target_api=EXCLUDED.target_api,
          version=md_route_aliases.version+1,enabled=true,updated_at=now()
        RETURNING version
      `,[tenantId,appId,slug,kind,target]);
      await client.query(`
        INSERT INTO md_route_alias_audit(tenant_id,app_api,slug,actor_id,operation,version)
        VALUES($1,$2,$3,$4,'save',$5)
      `,[tenantId,appId,slug,userId,result.rows[0].version]);
      return {alias:{appId,slug,kind,targetApiName:target,status:'Active',version:result.rows[0].version}};
    });
  }
  async disableAlias(tenantId:string,userId:string,appId:string,slug:string,expectedVersion:unknown) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(appId)||!/^[a-z][a-z0-9-]{0,62}$/.test(slug)||
      !Number.isSafeInteger(expectedVersion)||Number(expectedVersion)<1)
      throw new Error('Invalid alias disable request');
    await this.db.transaction(async client=>{
      const result=await client.query<{version:number}>(`
        UPDATE md_route_aliases SET enabled=false,version=version+1,updated_at=now()
        WHERE tenant_id=$1 AND app_api=$2 AND slug=$3 AND version=$4 AND enabled=true
        RETURNING version
      `,[tenantId,appId,slug,expectedVersion]);
      if(!result.rows[0])throw new Error('Route alias version conflict or already disabled');
      await client.query(`
        INSERT INTO md_route_alias_audit(tenant_id,app_api,slug,actor_id,operation,version)
        VALUES($1,$2,$3,$4,'disable',$5)
      `,[tenantId,appId,slug,userId,result.rows[0].version]);
    });
  }
  async resolveAlias(tenantId:string,appId:string,slug:string) {
    if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(appId)||!/^[a-z][a-z0-9-]{0,62}$/.test(slug))
      throw new Error('Invalid route alias');
    const {rows}=await this.db.query<{kind:string;target_api:string}>(`
      SELECT ra.kind,ra.target_api FROM md_route_aliases ra
      JOIN md_apps a ON a.api_name=ra.app_api AND a.enabled=true
      JOIN md_app_installations i ON i.tenant_id=$1 AND i.app_id=a.id
      JOIN md_app_entitlements e ON e.tenant_id=$1 AND e.app_id=a.id
      WHERE ra.tenant_id=$1 AND ra.app_api=$2 AND ra.slug=$3 AND ra.enabled=true
        AND e.active=true AND (e.expires_at IS NULL OR e.expires_at>now())
    `,[tenantId,appId,slug]);
    if(!rows[0])throw new Error('Route not available');
    const {kind,target_api:target}=rows[0];
    if(kind==='App Page'){
      const {rows:pages}=await this.db.query(
        'SELECT id FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true',[tenantId,target]);
      if(!pages[0])throw new Error('Page not available');
    }
    if(kind==='Record List'){
      const {rows:objects}=await this.db.query(
        'SELECT id FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',[tenantId,target]);
      if(!objects[0])throw new Error('Object not available');
    }
    const canonical=kind==='App Home'?'/une/apps/'+encodeURIComponent(appId)+'/home':
      kind==='App Page'?'/une/apps/'+encodeURIComponent(appId)+'/pages/'+encodeURIComponent(target):
      '/une/o/'+encodeURIComponent(target)+'/list?'+new URLSearchParams({filterName:'All'+target+'s',appId}).toString();
    return {path:canonical,canonicalPath:canonical,appId,kind,targetApiName:target};
  }
  async list(tenantId:string) {
    const {rows}=await this.db.query<{api_name:string;title:string}>(
      `SELECT api_name,title FROM md_page_definitions WHERE tenant_id=$1 AND enabled=true AND (NOT EXISTS (SELECT 1 FROM md_app_seed_pages s WHERE s.tenant_id=md_page_definitions.tenant_id AND s.page_id=md_page_definitions.id)
        OR EXISTS (SELECT 1 FROM md_app_seed_pages s JOIN md_apps a ON a.id=s.app_id AND a.enabled=true
          JOIN md_app_installations i ON i.app_id=s.app_id AND i.tenant_id=s.tenant_id
          JOIN md_app_entitlements e ON e.app_id=s.app_id AND e.tenant_id=s.tenant_id AND e.active=true
          AND (e.expires_at IS NULL OR e.expires_at>now()) WHERE s.tenant_id=md_page_definitions.tenant_id AND s.page_id=md_page_definitions.id)) ORDER BY title`,
      [tenantId]);
    return rows.map(row=>({apiName:row.api_name,label:row.title}));
  }
  async load(tenantId:string,pageApi:string) {
    const page=await this.db.query<{id:string;title:string}>(
      'SELECT id,title FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true',[tenantId,pageApi]);
    if(!page.rows[0]) throw new Error('Page not found');
    const owner=await this.db.query<{allowed:boolean}>(`SELECT EXISTS (
      SELECT 1 FROM md_app_installations i JOIN md_apps a ON a.id=i.app_id AND a.enabled=true
      JOIN md_app_entitlements e ON e.app_id=i.app_id AND e.tenant_id=i.tenant_id
      WHERE i.tenant_id=s.tenant_id AND i.app_id=s.app_id AND e.active=true
        AND (e.expires_at IS NULL OR e.expires_at>now())) AS allowed
      FROM md_app_seed_pages s WHERE s.tenant_id=$1 AND s.page_id=$2`,[tenantId,page.rows[0].id]);
    if(owner.rows.some(row=>!row.allowed))throw new Error('Permission denied');
    const components=await this.db.query<{id:string;component_api:string;slot:string;sort_order:number}>(
      'SELECT id,component_api,slot,sort_order FROM md_page_components WHERE tenant_id=$1 AND page_id=$2 ORDER BY sort_order',
      [tenantId,page.rows[0].id]);
    const properties=await this.db.query<{
      component_id:string;property_path:string;value_text:string|null;data_type:string;
      object_id:string|null;field_id:string|null;flow_id:string|null
    }>(`SELECT p.* FROM md_page_component_properties p JOIN md_page_components c ON c.tenant_id=p.tenant_id AND c.id=p.component_id
      WHERE c.tenant_id=$1 AND c.page_id=$2`,[tenantId,page.rows[0].id]);
    const configured=components.rows.map(c=>({...c,properties:expandAppProperties(properties.rows.filter(p=>p.component_id===c.id))}));
    return {page:{...page.rows[0],components:configured},components:configured};
  }
}
