import {expandAppProperties} from '../system-support/app-page-seeder.js';
import type { SqlPersistence } from './sql-persistence.js';

type PropRow={component_key:string;property_path:string;value_kind:string;value_text:string|null};
type NodeRow={component_key:string;component_type:string;label:string;region:string;visible:boolean};
function encodePageValue(value:unknown,path:string,rows:Array<{path:string;kind:string;text:string|null}>,depth=0):void{
  if(depth>16||rows.length>5000)throw new Error('Invalid Page component properties');
  if(value===undefined)return;
  const add=(kind:string,text:string|null)=>rows.push({path,kind,text});
  if(value===null){add('null',null);return;}
  if(Array.isArray(value)){
    add('array',null);
    value.forEach((v,i)=>encodePageValue(v,path+'/'+i,rows,depth+1));return;
  }
  if(typeof value==='object'){
    if(Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)
      throw new Error('Invalid Page property');
    add('object',null);
    for(const [k,v] of Object.entries(value)){
      if(['__proto__','prototype','constructor'].includes(k))throw new Error('Invalid Page property name');
      encodePageValue(v,path+'/'+k.replace(/~/g,'~0').replace(/\//g,'~1'),rows,depth+1);
    }return;
  }
  if(typeof value==='string'&&value.length<=20000){add('string',value);return;}
  if(typeof value==='number'&&Number.isFinite(value)){add('number',String(value));return;}
  if(typeof value==='boolean'){add('boolean',String(value));return;}
  throw new Error('Invalid Page property');
}
function decodePageValues(rows:PropRow[]):Record<string,unknown>{
  const output:Record<string,unknown>={};
  for(const row of [...rows].sort((a,b)=>a.property_path.split('/').length-b.property_path.split('/').length)){
    const parts=row.property_path.split('/').slice(1).map(p=>p.replace(/~1/g,'/').replace(/~0/g,'~'));
    if(!parts.length||parts.some(p=>['__proto__','constructor','prototype'].includes(p)))continue;
    let parent:Record<string,unknown>=output;
    for(const part of parts.slice(0,-1)){
      const next=parent[part];
      if(!next||typeof next!=='object')throw new Error('Invalid saved Page property');
      parent=next as Record<string,unknown>;
    }
    parent[parts[parts.length-1]]=row.value_kind==='array'?[]:row.value_kind==='object'?{}:
      row.value_kind==='null'?null:row.value_kind==='boolean'?row.value_text==='true':
      row.value_kind==='number'?Number(row.value_text):row.value_text??'';
  }
  return output;
}

export class PageRuntime {
  constructor(private readonly db:SqlPersistence) {}
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
