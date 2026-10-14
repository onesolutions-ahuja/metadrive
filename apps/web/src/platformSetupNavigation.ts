import {setupNavigation} from './metadata';
import {platformNavigationEntries} from './platformWorkspaceMetadata';

/** Registry-first Setup navigation. Unknown entries stay visible to preserve legacy routes.
 * Route permissions remain enforced by OneEngine; this function is not an authority.
 */
export function resolveSetupNavigation(
 query:string, canManagePlatformTenants:boolean, connectorNames:readonly string[]=[]
){
 const normalized=query.trim().toLowerCase();
 const registry=new Set(platformNavigationEntries().map(entry=>entry.label));
 return setupNavigation
  .filter(group=>group.group!=='Platform Administration'||canManagePlatformTenants)
  .map(group=>({...group,items:group.items.filter(label=>{
   if(!normalized)return true;
   const matchesLabel=label.toLowerCase().includes(normalized);
   const matchesConnector=label==='Une Connectors'&&connectorNames.some(name=>name.toLowerCase().includes(normalized));
   return matchesLabel||matchesConnector;
  }).sort((a,b)=>Number(registry.has(b))-Number(registry.has(a)))}))
  .filter(group=>group.items.length>0);
}
