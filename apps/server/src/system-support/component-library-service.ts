import {transform} from 'esbuild';
import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
type Actor={tenant_id:string;user_id:string};
const api=/^[A-Za-z][A-Za-z0-9_]*$/;
const surfaces=['page','dashboard','flow','platform'];
type ComponentRow={api_name:string;label:string;description:string;surfaces:string[];
 resize:Record<string,number>|null;jsx_source:string;css_source:string;compiled_js:string;scoped_css:string;
 version:number;published_version:number|null;status:string;updated_at:Date};
type HistoryRow={api_name:string;version:number;snapshot:Record<string,unknown>;published_at:Date};
function bodyOf(input:unknown){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Invalid component definition');
 const v=input as Record<string,unknown>;
 if(typeof v.apiName!=='string'||!api.test(v.apiName)||
  typeof v.label!=='string'||!v.label.trim()||v.label.length>160||
  typeof v.description!=='string'||v.description.length>2000||
  !Array.isArray(v.surfaces)||!v.surfaces.length||v.surfaces.length>4||
  v.surfaces.some(s=>typeof s!=='string'||!surfaces.includes(s))||
  new Set(v.surfaces).size!==v.surfaces.length||
  typeof v.jsxSource!=='string'||v.jsxSource.length>64000||
  typeof v.cssSource!=='string'||v.cssSource.length>64000||
  !['Draft','Published'].includes(String(v.publicationStatus)))
  throw new Error('Invalid component definition');
 const r=v.resize;
 if(r!==undefined&&(r===null||typeof r!=='object'||Array.isArray(r)||
  Object.entries(r).some(([k,x])=>!['defaultWidth','defaultHeight','minWidth','minHeight','maxWidth','maxHeight'].includes(k)||
   typeof x!=='number'||!Number.isFinite(x)||x<1||x>10000)))
  throw new Error('Invalid component dimensions');
 return {apiName:v.apiName,label:v.label.trim(),description:v.description,surfaces:v.surfaces,
  resize:r??null,jsxSource:v.jsxSource,cssSource:v.cssSource};
}
function compile(jsxSource:string,cssSource:string){
 if(!jsxSource.trim()||!/(?:export\s+default|module\.exports)/.test(jsxSource))
  throw new Error('Invalid component source: default export required');
 if(/\b(?:import\s*(?:\(|[{'"]|[A-Za-z_])|require\s*\()/m.test(jsxSource))
  throw new Error('Invalid component source: external imports are not allowed');
 return transform(jsxSource,{loader:'tsx',format:'cjs',target:'es2022',
  jsx:'transform',jsxFactory:'React.createElement',jsxFragment:'React.Fragment'})
   .then(r=>({compiledJs:r.code,scopedCss:cssSource}));
}
function snapshot(row:ComponentRow,compiledJs=row.compiled_js,scopedCss=row.scoped_css){
 return {apiName:row.api_name,label:row.label,description:row.description,
  surfaces:row.surfaces,resize:row.resize,jsxSource:row.jsx_source,cssSource:row.css_source,
  compiledJs,scopedCss};
}
function view(row:ComponentRow,revisions:HistoryRow[]=[]){
 return {...snapshot(row),version:row.version,publishedVersion:row.published_version??undefined,
  status:row.status,updatedAt:new Date(row.updated_at).toISOString(),
  revisions:revisions.map(r=>({...r.snapshot,version:r.version,
    updatedAt:new Date(r.published_at).toISOString()}))};
}
export class ComponentLibraryService {
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
 async list(actor:Actor){
  await this.rbac.require(actor.tenant_id,actor.user_id,'ComponentDefinition','read');
  const [items,history]=await Promise.all([
   this.db.query<ComponentRow>(
    'SELECT * FROM md_library_components WHERE tenant_id=$1 AND enabled=true ORDER BY label,api_name',[actor.tenant_id]),
   this.db.query<HistoryRow>(
    'SELECT api_name,version,snapshot,published_at FROM md_library_component_revisions WHERE tenant_id=$1 ORDER BY api_name,version DESC LIMIT 1000',
    [actor.tenant_id])
  ]);
  return items.rows.map(row=>view(row,history.rows.filter(h=>h.api_name===row.api_name)));
 }
 async create(actor:Actor,input:unknown){
  await this.rbac.require(actor.tenant_id,actor.user_id,'ComponentDefinition','create');
  const p=bodyOf(input);
  const component=await this.db.transaction(async client=>{
   const registry=await client.query<{id:string}>(`
    INSERT INTO md_component_definitions(tenant_id,api_name,renderer_key,enabled)
    VALUES($1,$2,'TenantSandbox',false)
    ON CONFLICT(tenant_id,api_name) DO NOTHING RETURNING id`,[actor.tenant_id,p.apiName]);
   if(!registry.rowCount)throw new Error('Component already exists');
   const {rows}=await client.query<ComponentRow>(`
    INSERT INTO md_library_components(tenant_id,api_name,label,description,surfaces,resize,jsx_source,css_source)
    VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8) RETURNING *`,
    [actor.tenant_id,p.apiName,p.label,p.description,p.surfaces,JSON.stringify(p.resize),p.jsxSource,p.cssSource]);
   await client.query("INSERT INTO md_security_events(tenant_id,actor_user_id,action) VALUES($1,$2,'component.create')",
    [actor.tenant_id,actor.user_id]);
   return view(rows[0]);
  });
  return {component};
 }
 async save(actor:Actor,name:string,input:unknown){
  await this.rbac.require(actor.tenant_id,actor.user_id,'ComponentDefinition','manage');
  if(!api.test(name))throw new Error('Invalid component API name');
  const p=bodyOf(input);
  if(p.apiName!==name)throw new Error('Component identity cannot be changed');
  const {rows}=await this.db.query<ComponentRow>(`
   UPDATE md_library_components SET label=$3,description=$4,surfaces=$5,
    resize=$6::jsonb,jsx_source=$7,css_source=$8,version=version+1,
    updated_at=now()
   WHERE tenant_id=$1 AND api_name=$2 AND enabled=true RETURNING *`,
   [actor.tenant_id,name,p.label,p.description,p.surfaces,JSON.stringify(p.resize),p.jsxSource,p.cssSource]);
  if(!rows[0])throw new Error('Component not found');
  return {component:view(rows[0])};
 }
 async publish(actor:Actor,name:string){
  await this.rbac.require(actor.tenant_id,actor.user_id,'ComponentDefinition','manage');
  if(!api.test(name))throw new Error('Invalid component API name');
  return this.db.transaction(async client=>{
   const {rows}=await client.query<ComponentRow>(
    'SELECT * FROM md_library_components WHERE tenant_id=$1 AND api_name=$2 AND enabled=true FOR UPDATE',
    [actor.tenant_id,name]);
   if(!rows[0])throw new Error('Component not found');
   const row=rows[0],built=await compile(row.jsx_source,row.css_source);
   const {rows:saved}=await client.query<ComponentRow>(`
    UPDATE md_library_components SET compiled_js=$3,scoped_css=$4,status='Published',
     published_version=version,updated_at=now()
    WHERE tenant_id=$1 AND api_name=$2 RETURNING *`,
    [actor.tenant_id,name,built.compiledJs,built.scopedCss]);
   await client.query('UPDATE md_component_definitions SET enabled=true WHERE tenant_id=$1 AND api_name=$2',
    [actor.tenant_id,name]);
   await client.query(`
    INSERT INTO md_library_component_revisions(tenant_id,api_name,version,snapshot)
    VALUES($1,$2,$3,$4::jsonb)
    ON CONFLICT(tenant_id,api_name,version) DO NOTHING`,
    [actor.tenant_id,name,row.version,JSON.stringify(snapshot(saved[0]))]);
   await client.query("INSERT INTO md_security_events(tenant_id,actor_user_id,action) VALUES($1,$2,'component.publish')",
    [actor.tenant_id,actor.user_id]);
   return {component:view(saved[0])};
  });
 }
 async rollback(actor:Actor,name:string,version:unknown){
  await this.rbac.require(actor.tenant_id,actor.user_id,'ComponentDefinition','manage');
  if(!api.test(name)||!Number.isSafeInteger(version)||Number(version)<1)
   throw new Error('Invalid component revision');
  return this.db.transaction(async client=>{
   const current=await client.query<ComponentRow>(
    'SELECT * FROM md_library_components WHERE tenant_id=$1 AND api_name=$2 AND enabled=true FOR UPDATE',
    [actor.tenant_id,name]);
   if(!current.rows[0])throw new Error('Component not found');
   const {rows:versions}=await client.query<{snapshot:Record<string,unknown>}>(`
    SELECT snapshot FROM md_library_component_revisions
    WHERE tenant_id=$1 AND api_name=$2 AND version=$3`,[actor.tenant_id,name,version]);
   if(!versions[0])throw new Error('Component revision not found');
   const saved=versions[0].snapshot;
   if(typeof saved.jsxSource!=='string'||typeof saved.cssSource!=='string')
    throw new Error('Invalid component revision');
   const built=await compile(saved.jsxSource,saved.cssSource);
   const {rows:updated}=await client.query<ComponentRow>(`
    UPDATE md_library_components SET label=$3,description=$4,surfaces=$5,
      resize=$6::jsonb,jsx_source=$7,css_source=$8,
      compiled_js=$9,scoped_css=$10,version=version+1,
      published_version=version+1,status='Published',updated_at=now()
    WHERE tenant_id=$1 AND api_name=$2 RETURNING *`,
    [actor.tenant_id,name,saved.label,saved.description,saved.surfaces,
     JSON.stringify(saved.resize??null),saved.jsxSource,saved.cssSource,built.compiledJs,built.scopedCss]);
   await client.query('INSERT INTO md_library_component_revisions(tenant_id,api_name,version,snapshot) VALUES($1,$2,$3,$4::jsonb)',
    [actor.tenant_id,name,updated[0].version,JSON.stringify(snapshot(updated[0]))]);
   await client.query("INSERT INTO md_security_events(tenant_id,actor_user_id,action) VALUES($1,$2,'component.rollback')",
    [actor.tenant_id,actor.user_id]);
   return {component:view(updated[0])};
  });
 }
 async remove(actor:Actor,name:string){
  await this.rbac.require(actor.tenant_id,actor.user_id,'ComponentDefinition','manage');
  if(!api.test(name))throw new Error('Invalid component API name');
  await this.db.transaction(async client=>{
   const used=await client.query(`
    SELECT 1 FROM md_page_components WHERE tenant_id=$1 AND component_api=$2 LIMIT 1`,
    [actor.tenant_id,name]);
   if(used.rowCount)throw new Error('Component is referenced by a Page');
   const updated=await client.query(
    'UPDATE md_library_components SET enabled=false,updated_at=now() WHERE tenant_id=$1 AND api_name=$2 AND enabled=true',
    [actor.tenant_id,name]);
   if(!updated.rowCount)throw new Error('Component not found');
   await client.query('UPDATE md_component_definitions SET enabled=false WHERE tenant_id=$1 AND api_name=$2',
    [actor.tenant_id,name]);
   await client.query("INSERT INTO md_security_events(tenant_id,actor_user_id,action) VALUES($1,$2,'component.disable')",
    [actor.tenant_id,actor.user_id]);
  });
 }
}
