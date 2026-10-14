import {createAuthorizedMetadataPublication} from './offline-publication.mjs';

/** Register an authenticated, permission-filtered metadata recovery endpoint.
 * All permission and tenant checks are delegated to the existing OneEngine APIs.
 */
export function registerMetadataPublicationRoute(app,guard,context){
 app.get('/api/metadata/offline-publication',guard,async(_req,res)=>{
  try {await context.sync();}
  catch(error){
   console.error('Unable to prepare metadata publication',error);
   return res.status(503).json({error:'Metadata publication unavailable'});
  }
  const principal=context.principal(res);
  const tenant=context.tenant(principal.tenantId);
  if(!tenant)return res.status(403).json({error:'Tenant membership is no longer active'});
  const apps=tenant.apps.filter(item=>context.canOpenApp(principal,tenant,item.apiName)).map(item=>({
   ...item,
   navigationItems:item.navigationItems.filter(name=>context.canOpenTab(principal,tenant,name)),
   navigationOrder:item.navigationOrder.filter(entry=>entry.type!=='Object'||context.canOpenTab(principal,tenant,entry.apiName))
  }));
  const state=context.state();
  const components=state.libraryComponents.filter(item=>
   context.visible(item,principal.tenantId,Object.keys(state.tenants)));
  res.setHeader('Cache-Control','private, no-store');
  return res.json(createAuthorizedMetadataPublication({
   tenantId:principal.tenantId,userId:principal.userId,
   objects:tenant.objects,pages:tenant.pages,apps,components
  }));
 });
}
