import {createHash} from 'node:crypto';
import type {Express,Request,Response,NextFunction} from 'express';
import type {SqlPersistence} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
import type {ObjectDefinitionService} from './object-definition.js';
import type {PageRuntime} from './page-runtime.js';
import type {ComponentRuntime} from './component-runtime.js';
import type {AppRuntime} from './app-runtime.js';
type Req=Request&{actor?:{tenant_id:string;user_id:string}};
export function registerOfflinePublicationRoutes(app:Express,db:SqlPersistence,rbac:RbacEngine,
 objects:ObjectDefinitionService,pages:PageRuntime,components:ComponentRuntime,apps:AppRuntime){
 app.get('/api/metadata/offline-publication',(req:Request,res:Response,next:NextFunction)=>{
  void (async()=>{
   const a=(req as Req).actor!;
   for(const p of ['ObjectDefinition','PageDefinition','ComponentDefinition'])
    await rbac.require(a.tenant_id,a.user_id,p,'read');
   await rbac.require(a.tenant_id,a.user_id,'AppExchange','read');
   // Keep the property order identical to the client's metadataPayloadDigest contract.
   const content={
    pages:await pages.list(a.tenant_id),
    apps:await apps.listInstalled(a.tenant_id),
    objects:await objects.list(a.tenant_id),
    components:await components.list(a.tenant_id)
   };
   const digest=createHash('sha256').update(JSON.stringify(content)).digest('hex');
   const {rows}=await db.query<{version:string;published_at:Date}>(`
    INSERT INTO md_offline_publications(tenant_id,user_id,digest)
    VALUES($1,$2,$3) ON CONFLICT(tenant_id,user_id) DO UPDATE SET
     version=CASE WHEN md_offline_publications.digest=EXCLUDED.digest
       THEN md_offline_publications.version ELSE md_offline_publications.version+1 END,
     published_at=CASE WHEN md_offline_publications.digest=EXCLUDED.digest
       THEN md_offline_publications.published_at ELSE now() END,
     digest=EXCLUDED.digest
    RETURNING version,published_at`,[a.tenant_id,a.user_id,digest]);
   const version=Number(rows[0]?.version);
   if(!Number.isSafeInteger(version)||version<1)throw Error('Invalid metadata publication revision');
   res.set('Cache-Control','private, no-store');
   res.json({content,publication:{
    revision:{version,publishedAt:new Date(rows[0].published_at).getTime(),digest},
    verifiedDigest:digest,minimumVersion:version
   }});
  })().catch(next);
 });
}
