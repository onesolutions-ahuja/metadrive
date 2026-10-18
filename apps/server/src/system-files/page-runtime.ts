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
    const {rows}=await this.db.query<{api_name:string}>(`SELECT p.api_name FROM md_page_definitions p
      JOIN md_lightning_page_details d ON d.tenant_id=p.tenant_id AND d.page_id=p.id
      WHERE p.tenant_id=$1 AND p.enabled=true ORDER BY p.title,p.api_name`,[tenantId]);
    return Promise.all(rows.map(row=>this.metadata(tenantId,row.api_name)));
  }
  private async loadLegacy(tenantId:string,pageApi:string) {
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

  async metadata(tenantId:string,pageApi:string){
    const {rows}=await this.db.query<{
      id:string;api_name:string;title:string;page_type:string;target_object:string;layout_mode:string;
      template:string|null;canvas_width:number;canvas_height:number;status:string;
      devices:string[];revision:number;updated_at:Date
    }>(`SELECT p.id,p.api_name,p.title,d.page_type,d.target_object,d.layout_mode,d.template,
      d.canvas_width,d.canvas_height,d.status,d.devices,d.revision,d.updated_at
      FROM md_page_definitions p JOIN md_lightning_page_details d
        ON d.tenant_id=p.tenant_id AND d.page_id=p.id
      WHERE p.tenant_id=$1 AND p.api_name=$2 AND p.enabled=true`,[tenantId,pageApi]);
    const page=rows[0];if(!page)throw new Error('Page not found');
    const [nodes,properties,assignments]=await Promise.all([
      this.db.query<NodeRow>(
        'SELECT component_key,component_type,label,region,visible FROM md_lightning_page_nodes WHERE tenant_id=$1 AND page_id=$2 ORDER BY sort_order',[tenantId,page.id]),
      this.db.query<PropRow>(
        'SELECT component_key,property_path,value_kind,value_text FROM md_lightning_page_node_properties WHERE tenant_id=$1 AND page_id=$2',[tenantId,page.id]),
      this.db.query<{assignment_id:string;scope:string;app_api:string|null;profile_id:string|null;record_type_id:string|null;desktop:boolean;phone:boolean}>(
        'SELECT assignment_id,scope,app_api,profile_id,record_type_id,desktop,phone FROM md_lightning_page_activation WHERE tenant_id=$1 AND page_id=$2 ORDER BY sort_order',[tenantId,page.id])
    ]);
    const components=nodes.rows.map(node=>{
      const data=decodePageValues(properties.rows.filter(row=>row.component_key===node.component_key));
      return {...(data.extra as Record<string,unknown>??{}),id:node.component_key,type:node.component_type,
        label:node.label,region:node.region,visible:node.visible,properties:data.props??{}};
    });
    return {apiName:page.api_name,label:page.title,targetObject:page.target_object,
      pageType:page.page_type,layoutMode:page.layout_mode,template:page.template??undefined,
      canvasWidth:page.canvas_width,canvasHeight:page.canvas_height,status:page.status,
      devices:page.devices,revision:page.revision,updatedAt:page.updated_at,
      components,activationAssignments:assignments.rows.map(a=>({
        id:a.assignment_id,scope:a.scope,appId:a.app_api,profileId:a.profile_id,recordTypeId:a.record_type_id,
        formFactors:[...(a.desktop?['Desktop']:[]),...(a.phone?['Phone']:[])]
      }))};
  }
  async load(tenantId:string,pageApi:string){
    const {rows}=await this.db.query<{found:boolean}>(`SELECT EXISTS(
      SELECT 1 FROM md_page_definitions p JOIN md_lightning_page_details d
        ON d.tenant_id=p.tenant_id AND d.page_id=p.id
      WHERE p.tenant_id=$1 AND p.api_name=$2) AS found`,[tenantId,pageApi]);
    return rows[0]?.found?{page:await this.metadata(tenantId,pageApi)}:this.loadLegacy(tenantId,pageApi);
  }
}
