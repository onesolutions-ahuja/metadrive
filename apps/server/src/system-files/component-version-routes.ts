import type {PoolClient} from 'pg';
import {transform} from 'esbuild';
import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
const wrap=(fn:(req:Req,res:Response)=>Promise<void>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req as Req,res).catch(next);};
const api=/^[A-Za-z][A-Za-z0-9_]*$/;
type Definition={apiName:string;label:string;description:string;surfaces:string[];resize:Record<string,number>;
 jsxSource:string;cssSource:string;compiledJs:string;scopedCss:string;publicationStatus:string;propertyDefinitions:unknown[]};
const allowed=new Set(['page','dashboard','flow','platform']);
const sizeKeys=['defaultWidth','defaultHeight','minWidth','minHeight'];
const clean=(raw:unknown):Definition=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid Component');
 const v=raw as Record<string,unknown>;
 if(typeof v.apiName!=='string'||!api.test(v.apiName)||typeof v.label!=='string'||!v.label.trim()
  ||v.label.length>200||typeof v.description!=='string'||v.description.length>2000
  ||!Array.isArray(v.surfaces)||!v.surfaces.length||v.surfaces.some(x=>!allowed.has(x))
  ||!v.resize||typeof v.resize!=='object'||Array.isArray(v.resize)
  ||typeof v.jsxSource!=='string'||v.jsxSource.length>100000
  ||typeof v.cssSource!=='string'||v.cssSource.length>50000
  ||!['Draft','Published'].includes(String(v.publicationStatus)))
  throw Error('Invalid Component metadata');
 const resize=v.resize as Record<string,number>;
 if(sizeKeys.some(k=>typeof resize[k]!=='number'||!Number.isFinite(resize[k])||resize[k]<1||resize[k]>5000)
  ||resize.minWidth>resize.defaultWidth||resize.minHeight>resize.defaultHeight)
  throw Error('Invalid Component dimensions');
 const properties=v.propertyDefinitions??[];
 if(!Array.isArray(properties)||properties.length>150)throw Error('Invalid Component properties');
 return {apiName:v.apiName,label:v.label.trim(),description:v.description,surfaces:[...new Set(v.surfaces)] as string[],
  resize:Object.fromEntries(sizeKeys.map(k=>[k,resize[k]])),jsxSource:v.jsxSource,cssSource:v.cssSource,
  compiledJs:'',scopedCss:'',publicationStatus:v.publicationStatus as string,propertyDefinitions:properties};
};
async function compile(def:Definition):Promise<Definition>{
 if(!def.jsxSource.trim()||!/(?:export\s+default|module\.exports\s*=)/.test(def.jsxSource)
  ||/(?:^|\n)\s*import\s|\brequire\s*\(|\bimport\s*\(/.test(def.jsxSource))
  throw Error('Component must export a default React component without imports');
 // Never execute tenant code on the API server. Compilation is transform-only.
 const transformed=await transform(def.jsxSource,{loader:'tsx',format:'cjs',target:'es2020',
  jsx:'transform',jsxFactory:'React.createElement',jsxFragment:'React.Fragment',
  minify:false,legalComments:'none'});
 if(!transformed.code||transformed.code.length>250000)throw Error('Compiled Component too large');
 return {...def,compiledJs:transformed.code,scopedCss:def.cssSource};
}
type Version={version:number;definition:Definition;state:string};
type DbComponent={id:string;api_name:string;renderer_key:string;enabled:boolean;published_version:number|null};
function result(row:DbComponent,version:Version,versions:Version[]){
 const d=version.definition;
 return {...d,apiName:row.api_name,version:version.version,updatedAt:new Date().toISOString(),
  status:version.state,publishedVersion:row.published_version,rendererKey:row.renderer_key,
  trustedBundled:false,revisions:versions.filter(x=>x.state==='Published').map(x=>({...x.definition,version:x.version}))};
}
export function registerComponentVersionRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine){
 const requireName=async(req:Req,action:'read'|'create'|'edit'|'delete')=>{
  const a=req.actor!;
  await rbac.require(a.tenant_id,a.user_id,'ComponentDefinition',action);
  if(req.params.apiName&&!api.test(req.params.apiName))throw Error('Invalid Component name');
  return a;
 };
 async function read(client:PoolClient,
  tenantId:string,name:string,lock=false){
  const r=await client.query('SELECT id,api_name,renderer_key,enabled,published_version FROM md_component_definitions WHERE tenant_id=$1 AND api_name=$2'+(lock?' FOR UPDATE':''),
   [tenantId,name]);
  if(!r.rows[0])throw Error('Component not found');
  const versions=await client.query(`SELECT version,state,definition FROM md_component_versions
   WHERE tenant_id=$1 AND component_id=$2 ORDER BY version DESC`,[tenantId,r.rows[0].id]);
  return {component:r.rows[0] as DbComponent,versions:versions.rows as Version[]};
 }
 const save=async(req:Req,res:Response,updating:boolean)=>{
  const a=await requireName(req,updating?'edit':'create');
  const definition=clean(req.body);
  if(updating&&req.params.apiName!==definition.apiName)throw Error('Component API name cannot change');
  const approved=definition.publicationStatus==='Published'?await compile(definition):definition;
  const response=await db.transaction(async client=>{
   if(!updating){
    const created=await client.query<DbComponent>(`INSERT INTO md_component_definitions
     (tenant_id,api_name,renderer_key,enabled) VALUES($1,$2,$2,true)
     ON CONFLICT(tenant_id,api_name) DO NOTHING
     RETURNING id,api_name,renderer_key,enabled,published_version`,[a.tenant_id,definition.apiName]);
    if(!created.rows[0])throw Error('Component already exists');
    const row=created.rows[0];
    await client.query(`INSERT INTO md_component_versions
     (tenant_id,component_id,version,state,definition,created_by)
     VALUES($1,$2,1,$3,$4::jsonb,$5)`,
     [a.tenant_id,row.id,approved.publicationStatus,JSON.stringify(approved),a.user_id]);
    if(approved.publicationStatus==='Published')await client.query(
     'UPDATE md_component_definitions SET published_version=1 WHERE tenant_id=$1 AND id=$2',
     [a.tenant_id,row.id]);
    return result({...row,published_version:approved.publicationStatus==='Published'?1:null},
     {version:1,state:approved.publicationStatus,definition:approved},
     [{version:1,state:approved.publicationStatus,definition:approved}]);
   }
   const existing=await read(client,a.tenant_id,definition.apiName,true),latest=existing.versions[0];
   if(!latest)throw Error('Component version missing');
   if(!existing.component.enabled)throw Error('Component is disabled');
   const version=latest.version+1;
   await client.query(`INSERT INTO md_component_versions
    (tenant_id,component_id,version,state,definition,created_by)
    VALUES($1,$2,$3,$4,$5::jsonb,$6)`,
    [a.tenant_id,existing.component.id,version,approved.publicationStatus,JSON.stringify(approved),a.user_id]);
   if(approved.publicationStatus==='Published')
    await client.query('UPDATE md_component_definitions SET published_version=$3 WHERE tenant_id=$1 AND id=$2',
     [a.tenant_id,existing.component.id,version]);
   return result({...existing.component,published_version:approved.publicationStatus==='Published'?version:existing.component.published_version},
     {version,state:approved.publicationStatus,definition:approved},
     [{version,state:approved.publicationStatus,definition:approved},...existing.versions]);
  });
  res.status(updating?200:201).json({component:response});
 };
 app.post('/api/component-library',wrap(async(req,res)=>save(req,res,false)));
 app.put('/api/component-library/:apiName',wrap(async(req,res)=>save(req,res,true)));
 app.post('/api/component-library/:apiName/publish',wrap(async(req,res)=>{
  const a=await requireName(req,'edit');
  const snapshot=await db.transaction(async client=>{
   const {component,versions}=await read(client,a.tenant_id,req.params.apiName,true);
   if(!component.enabled)throw Error('Component disabled');
   const draft=versions.find(x=>x.state==='Draft');
   if(!draft)throw Error('No Component draft to publish');
   const approved=await compile(draft.definition);
   const next=versions[0].version+1;
   await client.query(`INSERT INTO md_component_versions
    (tenant_id,component_id,version,state,definition,created_by)
    VALUES($1,$2,$3,'Published',$4::jsonb,$5)`,
    [a.tenant_id,component.id,next,JSON.stringify(approved),a.user_id]);
   await client.query('UPDATE md_component_definitions SET published_version=$3 WHERE tenant_id=$1 AND id=$2',
    [a.tenant_id,component.id,next]);
   return result({...component,published_version:next},{version:next,state:'Published',definition:approved},versions);
  });
  res.json({component:snapshot});
 }));
 app.post('/api/component-library/:apiName/rollback',wrap(async(req,res)=>{
  const a=await requireName(req,'edit'),target=req.body?.version;
  if(!Number.isSafeInteger(target)||target<1)throw Error('Invalid Component version');
  const snapshot=await db.transaction(async client=>{
   const {component,versions}=await read(client,a.tenant_id,req.params.apiName,true);
   const previous=versions.find(x=>x.version===target&&x.state==='Published');
   if(!previous)throw Error('Published Component version not found');
   const next=versions[0].version+1;
   await client.query(`INSERT INTO md_component_versions
    (tenant_id,component_id,version,state,definition,created_by)
    VALUES($1,$2,$3,'Published',$4::jsonb,$5)`,
    [a.tenant_id,component.id,next,JSON.stringify(previous.definition),a.user_id]);
   await client.query('UPDATE md_component_definitions SET published_version=$3,enabled=true WHERE tenant_id=$1 AND id=$2',
    [a.tenant_id,component.id,next]);
   return result({...component,published_version:next,enabled:true},
    {version:next,state:'Published',definition:previous.definition},versions);
  });
  res.json({component:snapshot});
 }));
 app.delete('/api/component-library/:apiName',wrap(async(req,res)=>{
  const a=await requireName(req,'delete');
  await db.transaction(async client=>{
   const {component}=await read(client,a.tenant_id,req.params.apiName,true);
   const used=await client.query('SELECT id FROM md_page_components WHERE tenant_id=$1 AND component_api=$2 LIMIT 1',
    [a.tenant_id,req.params.apiName]);
   if(used.rowCount)throw Error('Cannot disable a Component used by a Page');
   await client.query('UPDATE md_component_definitions SET enabled=false WHERE tenant_id=$1 AND id=$2',
    [a.tenant_id,component.id]);
  });
  res.status(204).end();
 }));
}
