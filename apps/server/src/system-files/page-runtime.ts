import {encodeMetadataValue,decodeMetadataValues,type MetadataValueRow} from './component-runtime.js';
import {expandAppProperties} from '../system-support/app-page-seeder.js';
import type { SqlPersistence } from './sql-persistence.js';

type PropRow=MetadataValueRow;
type NodeRow={component_key:string;component_type:string;label:string;region:string;visible:boolean};
const encodePageValue=encodeMetadataValue;
const decodePageValues=decodeMetadataValues;

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
    const configured=components.rows.map(c=>({
      id:c.id,type:c.component_api,label:c.component_api,region:c.slot,visible:true,
      properties:expandAppProperties(properties.rows.filter(p=>p.component_id===c.id))
    }));
    return {page:{
      apiName:pageApi,label:page.rows[0].title,targetObject:'',pageType:'App Page',
      layoutMode:'template',canvasWidth:1200,canvasHeight:800,status:'Active',
      devices:['Desktop','Phone'],components:configured
    },components:configured};
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

  /** Transactional draft publishing and component persistence; no JSON columns. */
  async save(tenantId:string,previousApiName:string,raw:unknown){
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid Page metadata');
    const p=raw as Record<string,unknown>;
    const id=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=128;
    if(!id(p.apiName)||!/^[A-Za-z][A-Za-z0-9_]*$/.test(p.apiName)
      ||!id(p.label)||!['Record Page','App Page','Home Page'].includes(String(p.pageType))
      ||!['template','free-canvas'].includes(String(p.layoutMode))
      ||!['Active','Draft'].includes(String(p.status))||typeof p.targetObject!=='string'
      ||!Number.isInteger(p.canvasWidth)||!Number.isInteger(p.canvasHeight)
      ||Number(p.canvasWidth)<320||Number(p.canvasWidth)>10000
      ||Number(p.canvasHeight)<320||Number(p.canvasHeight)>10000
      ||!Array.isArray(p.devices)||!p.devices.length||p.devices.length>2
      ||p.devices.some(v=>v!=='Desktop'&&v!=='Phone')
      ||!Array.isArray(p.components)||p.components.length>400
      ||!Array.isArray(p.activationAssignments??[])||(p.activationAssignments as unknown[]).length>200)
      throw new Error('Invalid Page metadata');
    if(p.pageType==='Record Page'){
      const found=await this.db.query('SELECT 1 FROM md_object_definitions WHERE tenant_id=$1 AND api_name=$2',[tenantId,p.targetObject]);
      if(!found.rowCount)throw new Error('Invalid Page target object');
    }
    const components=p.components as Array<Record<string,unknown>>;
    const keys=new Set<string>();
    for(const c of components){
      if(!c||typeof c!=='object'||Array.isArray(c)||!id(c.id)||!id(c.type)
        ||typeof c.label!=='string'||c.label.length>200||keys.has(c.id))throw new Error('Invalid Page component');
      keys.add(c.id);
    }
    const assignments=p.activationAssignments as Array<Record<string,unknown>>|undefined ?? [];
    if(p.status==='Active'&&p.pageType!=='App Page'&&!assignments.length)
      throw new Error('Invalid Page activation');
    const assignmentIds=new Set<string>();
    for(const a of assignments){
      if(!a||typeof a!=='object'||Array.isArray(a)||!id(a.id)||assignmentIds.has(a.id)
        ||!['Org Default','App Default','App and Profile','App, Record Type, and Profile'].includes(String(a.scope))
        ||!Array.isArray(a.formFactors)||!a.formFactors.length
        ||a.formFactors.some(v=>v!=='Desktop'&&v!=='Phone')
        ||(a.scope!=='Org Default'&&!id(a.appId))
        ||(['App and Profile','App, Record Type, and Profile'].includes(String(a.scope))&&!id(a.profileId))
        ||(a.scope==='App, Record Type, and Profile'&&!id(a.recordTypeId)))
        throw new Error('Invalid Page activation');
      assignmentIds.add(a.id);
    }
    await this.db.transaction(async client=>{
      const existing=await client.query<{id:string}>(
        'SELECT id FROM md_page_definitions WHERE tenant_id=$1 AND api_name=$2 FOR UPDATE',[tenantId,previousApiName]);
      let pageId=existing.rows[0]?.id;
      if(pageId){
        const managed=await client.query(
          'SELECT 1 FROM md_app_seed_pages WHERE tenant_id=$1 AND page_id=$2 LIMIT 1',[tenantId,pageId]);
        if(managed.rowCount)throw new Error('Invalid managed Page update');
        await client.query('UPDATE md_page_definitions SET api_name=$3,title=$4 WHERE tenant_id=$1 AND id=$2',
          [tenantId,pageId,p.apiName,p.label]);
      }else{
        if(p.apiName!==previousApiName)throw new Error('Page not found');
        const inserted=await client.query<{id:string}>(
          'INSERT INTO md_page_definitions(tenant_id,api_name,title,enabled) VALUES($1,$2,$3,true) RETURNING id',
          [tenantId,p.apiName,p.label]);
        pageId=inserted.rows[0].id;
      }
      const before=await client.query<{revision:number}>(
        'SELECT revision FROM md_lightning_page_details WHERE tenant_id=$1 AND page_id=$2 FOR UPDATE',[tenantId,pageId]);
      const rev=before.rows[0]?.revision??0;
      if(p.revision!==undefined&&p.revision!==rev)throw new Error('Page revision conflict');
      await client.query(`INSERT INTO md_lightning_page_details
        (tenant_id,page_id,page_type,target_object,layout_mode,template,canvas_width,canvas_height,status,devices,revision)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT(tenant_id,page_id) DO UPDATE SET
          page_type=EXCLUDED.page_type,target_object=EXCLUDED.target_object,
          layout_mode=EXCLUDED.layout_mode,template=EXCLUDED.template,
          canvas_width=EXCLUDED.canvas_width,canvas_height=EXCLUDED.canvas_height,
          status=EXCLUDED.status,devices=EXCLUDED.devices,revision=EXCLUDED.revision,updated_at=now()`,
        [tenantId,pageId,p.pageType,p.targetObject,p.layoutMode,p.template??null,
          p.canvasWidth,p.canvasHeight,p.status,p.devices,rev+1]);
      await client.query('DELETE FROM md_lightning_page_nodes WHERE tenant_id=$1 AND page_id=$2',[tenantId,pageId]);
      await client.query('DELETE FROM md_lightning_page_activation WHERE tenant_id=$1 AND page_id=$2',[tenantId,pageId]);
      for(const [index,c] of components.entries()){
        await client.query(`INSERT INTO md_lightning_page_nodes
          (tenant_id,page_id,component_key,component_type,label,region,visible,sort_order)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
          [tenantId,pageId,c.id,c.type,c.label,c.region??'main',c.visible!==false,index]);
        const extra=Object.fromEntries(Object.entries(c).filter(([key])=>
          !['id','type','label','region','visible','properties'].includes(key)));
        const props:Array<{path:string;kind:string;text:string|null}>=[];
        encodePageValue(c.properties??{},'/props',props);
        encodePageValue(extra,'/extra',props);
        for(const item of props){
          if(item.path.length>1024)throw new Error('Invalid Page property path');
          await client.query(`INSERT INTO md_lightning_page_node_properties
            (tenant_id,page_id,component_key,property_path,value_kind,value_text)
            VALUES($1,$2,$3,$4,$5,$6)`,[tenantId,pageId,c.id,item.path,item.kind,item.text]);
        }
      }
      for(const [index,a] of assignments.entries())await client.query(`INSERT INTO md_lightning_page_activation
        (tenant_id,page_id,assignment_id,scope,app_api,profile_id,record_type_id,desktop,phone,sort_order)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [tenantId,pageId,a.id,a.scope,a.appId??null,a.profileId??null,a.recordTypeId??null,
          (a.formFactors as string[]).includes('Desktop'),(a.formFactors as string[]).includes('Phone'),index]);
    });
    return this.metadata(tenantId,p.apiName);
  }

  /** Specific assignments take precedence over the org default; Draft pages cannot render. */
  async resolveRecordPage(tenantId:string,objectApi:string,appId:string,profileId:string,recordTypeId:string,device:string){
    if(device!=='Desktop'&&device!=='Phone')throw new Error('Invalid form factor');
    const {rows}=await this.db.query<{api_name:string}>(`SELECT p.api_name FROM md_page_definitions p
      JOIN md_lightning_page_details d ON d.tenant_id=p.tenant_id AND d.page_id=p.id
      JOIN md_lightning_page_activation a ON a.tenant_id=p.tenant_id AND a.page_id=p.id
      WHERE p.tenant_id=$1 AND p.enabled=true AND d.status='Active'
        AND d.page_type='Record Page' AND d.target_object=$2
        AND (($6='Desktop' AND a.desktop) OR ($6='Phone' AND a.phone))
        AND (a.scope='Org Default'
          OR (a.scope='App Default' AND a.app_api=$3)
          OR (a.scope='App and Profile' AND a.app_api=$3 AND a.profile_id=$4)
          OR (a.scope='App, Record Type, and Profile' AND a.app_api=$3
              AND a.profile_id=$4 AND a.record_type_id=$5))
      ORDER BY CASE a.scope WHEN 'App, Record Type, and Profile' THEN 4
        WHEN 'App and Profile' THEN 3 WHEN 'App Default' THEN 2 ELSE 1 END DESC,
        d.updated_at DESC,p.api_name ASC LIMIT 1`,
      [tenantId,objectApi,appId,profileId,recordTypeId,device]);
    return rows[0]?this.metadata(tenantId,rows[0].api_name):null;
  }
  async resolveAppPage(tenantId:string,appId:string,pageApi:string,device:string){
    if(device!=='Desktop'&&device!=='Phone')throw new Error('Invalid form factor');
    const {rows}=await this.db.query<{api_name:string}>(`SELECT p.api_name FROM md_page_definitions p
      JOIN md_app_installations i ON i.tenant_id=p.tenant_id
      JOIN md_apps a ON a.id=i.app_id AND a.enabled=true
        AND (a.tenant_owner_id IS NULL OR a.tenant_owner_id=p.tenant_id)
      LEFT JOIN md_tenant_app_metadata m ON m.tenant_id=i.tenant_id AND m.app_id=i.app_id
      JOIN md_app_entitlements e ON e.tenant_id=i.tenant_id AND e.app_id=i.app_id AND e.active=true
      WHERE p.tenant_id=$1 AND p.api_name=$3 AND p.enabled=true
        AND COALESCE(m.api_name,a.api_name)=$2
        AND (e.expires_at IS NULL OR e.expires_at>now())
        AND (
          EXISTS(SELECT 1 FROM md_lightning_page_details d
            JOIN md_lightning_page_activation x ON x.tenant_id=d.tenant_id AND x.page_id=d.page_id
            WHERE d.tenant_id=p.tenant_id AND d.page_id=p.id
              AND d.status='Active' AND d.page_type='App Page' AND x.app_api=$2
              AND (($4='Desktop' AND x.desktop) OR ($4='Phone' AND x.phone)))
          OR (
            NOT EXISTS(SELECT 1 FROM md_lightning_page_details d
              WHERE d.tenant_id=p.tenant_id AND d.page_id=p.id)
            AND EXISTS(SELECT 1 FROM md_tenant_app_navigation n
              WHERE n.tenant_id=i.tenant_id AND n.app_id=i.app_id
                AND n.entry_type='App Page' AND n.api_name=p.api_name)
          )
        )`,
      [tenantId,appId,pageApi,device]);
    return rows[0]?this.load(tenantId,rows[0].api_name):null;
  }
}
