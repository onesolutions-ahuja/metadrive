import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
const apiName=/^[A-Za-z][A-Za-z0-9_]{0,127}$/;
const validSurfaces=new Set(['page','dashboard','flow','platform']);
type Input={apiName:string;label:string;description:string;surfaces:string[];
 resize:{defaultWidth:number;defaultHeight:number;minWidth:number;minHeight:number};
 jsxSource:string;cssSource:string;publicationStatus:'Draft'|'Published'};
type VersionRow={version:number;state:'Draft'|'Published';properties:Omit<Input,'publicationStatus'>;
 created_at:Date;published_version:number|null};
export class ComponentLibraryService{
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine){}
 private validate(value:unknown):Input{
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid component');
  const p=value as Record<string,unknown>,resize=p.resize as Record<string,unknown>|undefined;
  if(typeof p.apiName!=='string'||!apiName.test(p.apiName)||
   typeof p.label!=='string'||!p.label.trim()||p.label.length>200||
   typeof p.description!=='string'||p.description.length>2000||
   !Array.isArray(p.surfaces)||!p.surfaces.length||p.surfaces.length>4||
   p.surfaces.some(x=>!validSurfaces.has(String(x)))||
   new Set(p.surfaces).size!==p.surfaces.length||
   !resize||typeof resize!=='object'||Array.isArray(resize)||
   ['defaultWidth','defaultHeight','minWidth','minHeight'].some(x=>
    !Number.isInteger(resize[x])||Number(resize[x])<1||Number(resize[x])>10000)||
   Number(resize.defaultWidth)<Number(resize.minWidth)||
   Number(resize.defaultHeight)<Number(resize.minHeight)||
   typeof p.jsxSource!=='string'||p.jsxSource.length>100000||
   typeof p.cssSource!=='string'||p.cssSource.length>100000||
   !['Draft','Published'].includes(String(p.publicationStatus)))
    throw Error('Invalid component definition');
  // The compiler and isolated browser renderer remain separate from this SQL service.
  // Never accept client-provided compiled executable code as a trusted server artifact.
  if(p.compiledJs!==undefined||p.scopedCss!==undefined)throw Error('Compiled code cannot be supplied');
  return {apiName:p.apiName,label:p.label.trim(),description:p.description,
   surfaces:p.surfaces as string[],resize:resize as Input['resize'],
   jsxSource:p.jsxSource,cssSource:p.cssSource,
   publicationStatus:p.publicationStatus as Input['publicationStatus']};
 }
 private view(api:string,row:VersionRow){
  return {...row.properties,apiName:api,version:row.version,
   status:row.state,publishedVersion:row.published_version,
   updatedAt:new Date(row.created_at).toISOString(),
   compiledJs:'',scopedCss:''};
 }
 async list(tenant:string,user:string){
  await this.rbac.require(tenant,user,'ComponentDefinition','read');
  const {rows}=await this.db.query<VersionRow&{component_api:string}>(`
   SELECT h.component_api,v.version,v.state,v.properties,v.created_at,h.published_version
   FROM md_component_library_heads h
   JOIN md_component_definitions d ON d.tenant_id=h.tenant_id AND d.api_name=h.component_api
   JOIN md_component_library_versions v ON v.tenant_id=h.tenant_id AND v.component_api=h.component_api
    AND v.version=h.current_version
   WHERE h.tenant_id=$1 AND d.enabled=true ORDER BY h.component_api`,[tenant]);
  return rows.map(row=>this.view(row.component_api,row));
 }
 async save(tenant:string,user:string,value:unknown,existing?:string){
  await this.rbac.require(tenant,user,'ComponentDefinition',existing?'manage':'create');
  const p=this.validate(value);
  if(existing!==undefined&&(!apiName.test(existing)||existing!==p.apiName))
   throw Error('Component identity cannot change');
  const state=p.publicationStatus;
  const {publicationStatus:_ignored,...properties}=p;
  const row=await this.db.transaction(async client=>{
   if(!existing){
    const created=await client.query(`INSERT INTO md_component_definitions(tenant_id,api_name,renderer_key)
      VALUES($1,$2,'tenant-library') ON CONFLICT DO NOTHING RETURNING id`,[tenant,p.apiName]);
    if(!created.rowCount)throw Error('Component already exists');
    await client.query(`INSERT INTO md_component_library_versions
      (tenant_id,component_api,version,state,properties,created_by)
      VALUES($1,$2,1,$3,$4::jsonb,$5)`,[tenant,p.apiName,state,JSON.stringify(properties),user]);
    await client.query(`INSERT INTO md_component_library_heads
      (tenant_id,component_api,current_version,published_version)
      VALUES($1,$2,1,$3)`,[tenant,p.apiName,state==='Published'?1:null]);
    return 1;
   }
   const locked=await client.query<{current_version:number}>(`SELECT h.current_version
     FROM md_component_library_heads h JOIN md_component_definitions d
       ON d.tenant_id=h.tenant_id AND d.api_name=h.component_api
     WHERE h.tenant_id=$1 AND h.component_api=$2 AND d.renderer_key='tenant-library'
      AND d.enabled=true FOR UPDATE OF h`,[tenant,existing]);
   if(!locked.rows[0])throw Error('Component not found');
   const next=locked.rows[0].current_version+1;
   await client.query(`INSERT INTO md_component_library_versions
     (tenant_id,component_api,version,state,properties,created_by)
     VALUES($1,$2,$3,$4,$5::jsonb,$6)`,[tenant,p.apiName,next,state,JSON.stringify(properties),user]);
   await client.query(`UPDATE md_component_library_heads SET current_version=$3,
      published_version=CASE WHEN $4='Published' THEN $3 ELSE published_version END,
      updated_at=now() WHERE tenant_id=$1 AND component_api=$2`,[tenant,p.apiName,next,state]);
   return next;
  });
  return (await this.list(tenant,user)).find(x=>x.apiName===p.apiName&&x.version===row);
 }
 async publish(tenant:string,user:string,api:string,restoreVersion?:number){
  await this.rbac.require(tenant,user,'ComponentDefinition','manage');
  if(!apiName.test(api)||restoreVersion!==undefined&&(!Number.isSafeInteger(restoreVersion)||restoreVersion<1))
   throw Error('Invalid component version');
  await this.db.transaction(async client=>{
   const locked=await client.query<{current_version:number}>(`SELECT h.current_version FROM md_component_library_heads h
     JOIN md_component_definitions d ON d.tenant_id=h.tenant_id AND d.api_name=h.component_api
     WHERE h.tenant_id=$1 AND h.component_api=$2 AND d.enabled=true
      AND d.renderer_key='tenant-library' FOR UPDATE OF h`,[tenant,api]);
   if(!locked.rows[0])throw Error('Component not found');
   const source=restoreVersion??locked.rows[0].current_version;
   const original=await client.query<{properties:unknown}>(`SELECT properties FROM md_component_library_versions
     WHERE tenant_id=$1 AND component_api=$2 AND version=$3`,[tenant,api,source]);
   if(!original.rows[0])throw Error('Component version not found');
   const next=locked.rows[0].current_version+1;
   await client.query(`INSERT INTO md_component_library_versions
     (tenant_id,component_api,version,state,properties,created_by)
     VALUES($1,$2,$3,'Published',$4::jsonb,$5)`,
     [tenant,api,next,JSON.stringify(original.rows[0].properties),user]);
   await client.query(`UPDATE md_component_library_heads SET
     current_version=$3,published_version=$3,updated_at=now()
     WHERE tenant_id=$1 AND component_api=$2`,[tenant,api,next]);
  });
  return (await this.list(tenant,user)).find(x=>x.apiName===api);
 }
 async remove(tenant:string,user:string,api:string){
  await this.rbac.require(tenant,user,'ComponentDefinition','manage');
  if(!apiName.test(api))throw Error('Invalid component name');
  const {rowCount}=await this.db.query(`UPDATE md_component_definitions SET enabled=false
    WHERE tenant_id=$1 AND api_name=$2 AND renderer_key='tenant-library' AND enabled=true`,[tenant,api]);
  if(!rowCount)throw Error('Component not found');
 }
}
