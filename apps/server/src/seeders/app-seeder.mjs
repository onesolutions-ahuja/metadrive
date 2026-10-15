import {readFileSync} from 'node:fs';
import {applyInstallableAppPackages} from '../installable-app-packages.mjs';

const catalogPath=new URL('../../data/installable-app-packages.json',import.meta.url);
function catalog(){return JSON.parse(readFileSync(catalogPath,'utf8'));}
export function listAppSeeders(){
  return (catalog().packages??[]).map(p=>({
    id:p.appKey,version:p.version??1,dependencies:p.dependencies??[]
  }));
}
export function appSeedDefinitions(appKey){
  if(typeof appKey!=='string'||!appKey.trim())throw Error('App seeder requires an app key');
  const pkg=(catalog().packages??[]).find(p=>p.appKey===appKey);
  if(!pkg)throw Error('Unknown installable app seeder');
  return structuredClone(pkg);
}
export function seedInstalledTenantApp(tenant,tenantId,appKey){
  if(!tenantId||typeof tenantId!=='string')throw Error('Tenant identity is required');
  const pkg=appSeedDefinitions(appKey);
  const installed=(tenant.records?.Connector_App__c??[]).some(r=>r.AppKey__c===appKey&&r.Installed__c===true);
  if(!installed)throw Error('App must first be installed through AppExchange');
  return applyInstallableAppPackages(tenant,{packages:[pkg],retiredPackages:[]},tenantId);
}
