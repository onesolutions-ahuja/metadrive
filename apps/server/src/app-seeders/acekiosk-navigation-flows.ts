import type {SqlPersistence} from '../system-files/sql-persistence.js';
import {encodeMetadataValue} from '../system-files/component-runtime.js';

type FlowNode={id:number;type:string;label:string;config:Record<string,unknown>};
type Output={name:string;type:string;dataType:string;availableForOutput:boolean};
type Template={apiName:string;label:string;nodes:FlowNode[];outputs:Output[]};

/** Declarative kiosk Flow templates. No business records or automatic user grants. */
const TEMPLATES:Template[]=[
 {
  apiName:'AceKioskStartSession',label:'AceKiosk - Start Session',
  nodes:[
   {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
   {id:2,type:'Create Records',label:'Create cart session',config:{
     object:'Cart',resultVariable:'sessionId',
     fieldValues:[
      {field:'Name',value:'Kiosk order'},
      {field:'ServiceMode',value:'{!serviceMode}'},
      {field:'Status',value:'Open'}
     ]
   }},
   {id:3,type:'End',label:'End',config:{}}
  ],outputs:[{name:'sessionId',type:'Variable',dataType:'Text',availableForOutput:true}]
 },
 {
  apiName:'AceKioskFilterMenu',label:'AceKiosk - Filter Menu',
  nodes:[
   {id:1,type:'Start',label:'Start',config:{executionContext:'User'}},
   {id:2,type:'Get Records',label:'Get matching products',config:{
     object:'Product',recordLimit:'all',outputVariable:'products',
     conditions:[{field:'MenuCategory',operator:'Equals',value:'{!categoryId}'}]
   }},
   {id:3,type:'End',label:'End',config:{}}
  ],outputs:[{name:'products',type:'Record Collection',dataType:'Product',availableForOutput:true}]
 }
];

export async function seedAceKioskNavigationFlows(db:SqlPersistence):Promise<number>{
 const {rows}=await db.query<{tenant_id:string}>(`
   SELECT i.tenant_id FROM md_app_installations i
   JOIN md_apps a ON a.id=i.app_id AND a.api_name='AceKiosk' AND a.enabled
   JOIN md_app_entitlements e ON e.tenant_id=i.tenant_id AND e.app_id=i.app_id
   WHERE e.active AND (e.expires_at IS NULL OR e.expires_at>now())`);
 let created=0;
 for(const tenant of rows)await db.transaction(async client=>{
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[tenant.tenant_id+':acekiosk:navigation']);
   // The app's permission set remains assignable. Existing user assignments are untouched.
   await client.query(`
     INSERT INTO md_permission_rules(tenant_id,permission_set_id,resource,action,effect)
     SELECT $1,p.id,rights.resource,rights.action,'allow'
     FROM md_permission_sets p CROSS JOIN (VALUES
      ('Flow:AceKioskStartSession','execute'),('Flow:AceKioskFilterMenu','execute'),
      ('Cart','create'),('Cart.Name','create'),('Cart.ServiceMode','create'),
      ('Cart.Status','create')
     ) rights(resource,action)
     WHERE p.tenant_id=$1 AND p.api_name='AceKioskUser'
     ON CONFLICT DO NOTHING`,[tenant.tenant_id]);
   const {rows:objects}=await client.query<{api_name:string}>(`
     SELECT api_name FROM md_object_definitions WHERE tenant_id=$1
     AND api_name IN ('Product','Cart','MenuCategory')`,[tenant.tenant_id]);
   const objectNames=new Set(objects.map(o=>o.api_name));
   for(const template of TEMPLATES){
     if(template.apiName==='AceKioskStartSession'&&!objectNames.has('Cart'))continue;
     if(template.apiName==='AceKioskFilterMenu'&&(!objectNames.has('Product')||!objectNames.has('MenuCategory')))continue;
     const exists=await client.query('SELECT 1 FROM md_flow_definitions WHERE tenant_id=$1 AND api_name=$2 LIMIT 1',
       [tenant.tenant_id,template.apiName]);
     if(exists.rowCount)continue; // preserve all tenant customisations and flow versions.
     const {rows:flows}=await client.query<{id:string}>(`
       INSERT INTO md_flow_definitions(tenant_id,api_name,label,flow_type,version,active)
       VALUES($1,$2,$3,'Autolaunched Flow',1,true) RETURNING id`,
       [tenant.tenant_id,template.apiName,template.label]);
     const nodes=template.nodes;
     const graph={
       apiName:template.apiName,label:template.label,appApiName:'AceKiosk',
       flowType:'Autolaunched Flow',status:'Active',version:1,elements:nodes,
       connectors:nodes.slice(0,-1).map((n,index)=>({from:n.id,to:nodes[index+1].id,label:'Next',kind:'normal'})),
       resources:template.outputs,tests:[]
     };
     const entries:Array<{path:string;kind:string;text:string|null}>=[];
     encodeMetadataValue(graph,'/builder',entries);
     for(const entry of entries)await client.query(`
       INSERT INTO md_flow_editor_values(tenant_id,flow_id,property_path,value_kind,value_text)
       VALUES($1,$2,$3,$4,$5)`,[tenant.tenant_id,flows[0].id,entry.path,entry.kind,entry.text]);
     created++;
   }
 });
 return created;
}
