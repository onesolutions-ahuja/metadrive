import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(fn:(r:Req,s:Response)=>Promise<void>)=>(r:Request,s:Response,n:NextFunction)=>{void fn(r as Req,s).catch(n);};
const safe=/^[A-Za-z][A-Za-z0-9_]*$/;
type ComponentRow={id:string;api_name:string;renderer_key:string;published_version:number|null;enabled:boolean};
type Version={version:number;definition:Record<string,unknown>;state:string};
export function registerComponentPublishingRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 const guard=async(req:Req,action:'edit'|'delete')=>{
  const a=req.actor!,name=req.params.apiName;
  if(!safe.test(name))throw Error('Invalid Component');
  await rbac.require(a.tenant_id,a.user_id,'ComponentDefinition',action);
  return a;
 };
 const format=(row:ComponentRow,version:Version)=>({
  ...version.definition,apiName:row.api_name,rendererKey:row.renderer_key,
  version:version.version,publishedVersion:version.state==='Published'?version.version:row.published_version,
  status:version.state
 });
 app.put('/api/component-library/:apiName',wrap(async(req,res)=>{
  const a=await guard(req,'edit'),body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||body.apiName!==req.params.apiName||
     typeof body.label!=='string'||!body.label.trim()||!Array.isArray(body.surfaces)||
     body.surfaces.some((s:unknown)=>!['page','flow','dashboard','platform'].includes(String(s)))||
     JSON.stringify(body).length>64000)throw Error('Invalid component draft');
  // Published components map to a pre-registered client renderer. Never execute JSX from tenant metadata.
  if(body.jsxSource||body.compiledJs||body.cssSource||body.scopedCss)
   throw Error('Untrusted Component code cannot be published by the metadata runtime');
  const result=await db.transaction(async client=>{
   const {rows}=await client.query<ComponentRow>(
    'SELECT id,api_name,renderer_key,published_version,enabled FROM md_component_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true FOR UPDATE',
    [a.tenant_id,req.params.apiName]);
   if(!rows[0])throw Error('Component renderer not registered');
   const versions=await client.query<{version:number}>(
    'SELECT COALESCE(max(version),0)::integer AS version FROM md_component_versions WHERE tenant_id=$1 AND component_id=$2',
    [a.tenant_id,rows[0].id]);
   const version=versions.rows[0].version+1;
   const metadata={...body,apiName:req.params.apiName,rendererKey:rows[0].renderer_key};
   await client.query(`INSERT INTO md_component_versions(tenant_id,component_id,version,state,definition,created_by)
     VALUES($1,$2,$3,'Draft',$4::jsonb,$5)`,[a.tenant_id,rows[0].id,version,JSON.stringify(metadata),a.user_id]);
   return format(rows[0],{version,state:'Draft',definition:metadata});
  });
  res.json({component:result});
 }));
 app.post('/api/component-library/:apiName/publish',wrap(async(req,res)=>{
  const a=await guard(req,'edit');
  const component=await db.transaction(async client=>{
   const {rows}=await client.query<ComponentRow>(
    'SELECT id,api_name,renderer_key,published_version,enabled FROM md_component_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true FOR UPDATE',
    [a.tenant_id,req.params.apiName]);
   const row=rows[0];if(!row)throw Error('Component not registered');
   const drafts=await client.query<Version>(
    "SELECT version,state,definition FROM md_component_versions WHERE tenant_id=$1 AND component_id=$2 AND state='Draft' ORDER BY version DESC LIMIT 1",
    [a.tenant_id,row.id]);
   let version=drafts.rows[0];
   if(!version){
    if(row.published_version){
     const existing=await client.query<Version>(
      'SELECT version,state,definition FROM md_component_versions WHERE tenant_id=$1 AND component_id=$2 AND version=$3',
      [a.tenant_id,row.id,row.published_version]);
     if(existing.rows[0])return format(row,existing.rows[0]);
    }
    // Seeded Component Registry entries are trusted metadata with a shared renderer key.
    version={version:1,state:'Published',definition:{apiName:row.api_name,label:row.api_name,rendererKey:row.renderer_key,surfaces:['page','dashboard','flow','platform']}};
    await client.query(`INSERT INTO md_component_versions(tenant_id,component_id,version,state,definition,created_by)
      VALUES($1,$2,1,'Published',$3::jsonb,$4)`,[a.tenant_id,row.id,JSON.stringify(version.definition),a.user_id]);
   }else{
    if(version.definition.compiledJs||version.definition.jsxSource||version.definition.cssSource||version.definition.scopedCss)
     throw Error('Component requires a trusted compiled renderer registration');
    await client.query("UPDATE md_component_versions SET state='Published' WHERE tenant_id=$1 AND component_id=$2 AND version=$3",
     [a.tenant_id,row.id,version.version]);
   }
   await client.query('UPDATE md_component_definitions SET published_version=$3 WHERE tenant_id=$1 AND id=$2',
    [a.tenant_id,row.id,version.version]);
   return format({...row,published_version:version.version},{...version,state:'Published'});
  });
  res.json({component});
 }));
 app.post('/api/component-library/:apiName/rollback',wrap(async(req,res)=>{
  const a=await guard(req,'edit'),version=req.body?.version;
  if(!Number.isSafeInteger(version)||version<1)throw Error('Invalid published Component version');
  const component=await db.transaction(async client=>{
   const {rows}=await client.query<ComponentRow>(
    'SELECT id,api_name,renderer_key,published_version,enabled FROM md_component_definitions WHERE tenant_id=$1 AND api_name=$2 AND enabled=true FOR UPDATE',
    [a.tenant_id,req.params.apiName]);
   const row=rows[0];if(!row)throw Error('Component not registered');
   const selected=await client.query<Version>(
    "SELECT version,state,definition FROM md_component_versions WHERE tenant_id=$1 AND component_id=$2 AND version=$3 AND state='Published'",
    [a.tenant_id,row.id,version]);
   if(!selected.rows[0])throw Error('Published Component version not found');
   const v=await client.query<{version:number}>(
    'SELECT COALESCE(max(version),0)::integer+1 AS version FROM md_component_versions WHERE tenant_id=$1 AND component_id=$2',
    [a.tenant_id,row.id]);
   const next=v.rows[0].version;
   await client.query(`INSERT INTO md_component_versions(tenant_id,component_id,version,state,definition,created_by)
     VALUES($1,$2,$3,'Published',$4::jsonb,$5)`,
    [a.tenant_id,row.id,next,JSON.stringify(selected.rows[0].definition),a.user_id]);
   await client.query('UPDATE md_component_definitions SET published_version=$3 WHERE tenant_id=$1 AND id=$2',
    [a.tenant_id,row.id,next]);
   return format({...row,published_version:next},{version:next,state:'Published',definition:selected.rows[0].definition});
  });
  res.json({component});
 }));
 app.delete('/api/component-library/:apiName',wrap(async(req,res)=>{
  const a=await guard(req,'delete');
  await db.transaction(async client=>{
   const {rows}=await client.query<ComponentRow>(
    'SELECT id,api_name,renderer_key,published_version,enabled FROM md_component_definitions WHERE tenant_id=$1 AND api_name=$2 FOR UPDATE',
    [a.tenant_id,req.params.apiName]);
   const component=rows[0];if(!component||!component.enabled)throw Error('Component not found');
   const inUse=await client.query('SELECT id FROM md_page_components WHERE tenant_id=$1 AND component_api=$2 LIMIT 1',
    [a.tenant_id,req.params.apiName]);
   if(inUse.rowCount)throw Error('Component is referenced by Pages; remove dependencies first');
   await client.query('UPDATE md_component_definitions SET enabled=false WHERE tenant_id=$1 AND id=$2',
    [a.tenant_id,component.id]);
  });
  res.status(204).end();
 }));
}
