// Generic centrally authorised Page deletion. No Kiosk-specific identities.
const safeName=/^[A-Za-z][A-Za-z0-9_]*$/;
const references=(root,target)=>{
 const visited=new WeakSet();
 const visit=(node,depth)=>{
  if(depth>20||!node||typeof node!=='object')return false;
  if(visited.has(node))return false;
  visited.add(node);
  if(Array.isArray(node))return node.some(value=>visit(value,depth+1));
  for(const [key,value] of Object.entries(node)){
   if(['navigationPageApiName','targetPageApiName','pageApiName','destinationPageApiName']
      .includes(key)&&value===target)return true;
   if(value && typeof value==='object' && visit(value,depth+1))return true;
  }
  return false;
 };
 return visit(root,0);
};
export function pageDeletionBlockers(tenant,pageName){
 const blockers=[];
 for(const app of tenant.apps??[]){
  if((app.navigationPageApiNames??[]).includes(pageName)
   ||(app.navigationOrder??[]).some(item=>item.apiName===pageName&&item.type==='App Page'))
   blockers.push('App navigation: '+app.apiName);
 }
 for(const page of tenant.pages??[]){
  if(page.apiName!==pageName && references(page.components,pageName))
   blockers.push('Page action: '+page.apiName);
 }
 for(const flow of tenant.flows??[]){
  if(references(flow,pageName))blockers.push('Flow: '+flow.apiName);
 }
 for(const alias of tenant.routeAliases??[]){
  if(references(alias,pageName))blockers.push('Route alias');
 }
 return blockers;
}
export function registerPageDeletionRoute(app,{permission,getPrincipal,getState,isProtected,commit}){
 app.delete('/api/metadata/pages/:apiName',permission,async(req,res)=>{
  const name=String(req.params.apiName??'');
  if(!safeName.test(name))return res.status(400).json({error:'Invalid Page API name'});
  const tenantId=getPrincipal(res).tenantId;
  const state=getState();
  const tenant=state.tenants[tenantId];
  if(!tenant)return res.status(404).json({error:'Tenant unavailable'});
  const page=(tenant.pages??[]).find(page=>page.apiName===name);
  if(!page)return res.status(404).json({error:'Page not found'});
  if(isProtected(page))return res.status(403).json({error:'Protected administration Page cannot be deleted'});
  const blockers=pageDeletionBlockers(tenant,name);
  if(blockers.length)return res.status(409).json({error:'Page has dependencies',dependencies:blockers});
  const next={...state,tenants:{...state.tenants,
   [tenantId]:{...tenant,pages:tenant.pages.filter(page=>page.apiName!==name)}}};
  try{await commit(next);return res.json({deleted:true,apiName:name})}
  catch(error){return res.status(503).json({error:'Page deletion could not be committed'})}
 });
}
