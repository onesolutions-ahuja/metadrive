import {applyInstallableAppPackages} from '../installable-app-packages.mjs';

/**
 * AppExchange owns installation, authorization, entitlement, dependency checks
 * and navigation. Seed only the requested installed app, never all catalog apps.
 * No tenant business data is overwritten by this seeder.
 */
export function installedAppSeed(tenant, catalog, tenantId, appKey) {
  if (!appKey || !tenantId) throw Error('Tenant and app key required');
  const pkg = (catalog?.packages ?? []).find(item => item.appKey === appKey);
  if (!pkg) throw Error('AppExchange package not registered: ' + appKey);
  const installed = (tenant.records?.Connector_App__c ?? [])
    .some(row => row.AppKey__c === appKey && row.Installed__c === true);
  if (!installed) return tenant;
  return applyDeveloperAppGrants(tenant,applyInstallableAppPackages(tenant,
    {...catalog, packages: [pkg], retiredPackages: [], retiredTrustedComponentPrefixes: []}, tenantId),[pkg]);
}
export function listSeedPackages(catalog) {
  return (catalog?.packages ?? []).map(pkg => ({
    appKey: pkg.appKey,
    objects: (pkg.objects ?? []).length,
    pages: (pkg.pages ?? []).length,
    flows: (pkg.flows ?? []).length,
    components: (pkg.components ?? []).length
  }));
}

/** Reconciliation keeps all existing AppExchange entitlement and uninstall gates. */
export function reconcileInstalledAppSeeds(tenant,catalog,tenantId) {
  return reconcileDeviceDeveloperGrant(applyDeveloperAppGrants(tenant,applyInstallableAppPackages(tenant,catalog,tenantId),catalog?.packages??[]));
}

/**
 * Initial OneEngine Tenant Developer access for metadata ADDED by installing
 * an active package. Existing explicit permissions, including denies, are
 * administrator-owned and never replayed or overwritten on reinstall.
 */
export function applyDeveloperAppGrants(before, after, packages) {
  const policyIndex=(after.accessControl?.permissionSets??[])
    .findIndex(policy=>policy.id==='oneengine-tenant-developer');
  if (policyIndex<0) return after;
  const policy=after.accessControl.permissionSets[policyIndex];
  const objectPermissions={...(policy.objectPermissions??{})};
  const fieldPermissions={...(policy.fieldPermissions??{})};
  const appPermissions={...(policy.appPermissions??{})};
  const oldObjects=new Map((before.objects??[]).map(object=>[object.apiName,object]));
  const oldApps=new Set((before.apps??[]).map(app=>app.apiName));
  let changed=false;
  for(const pkg of packages) {
    const installation=(after.records?.Connector_App__c??[])
      .find(row=>row.AppKey__c===pkg.appKey && row.Installed__c===true);
    if(!installation || (!pkg.installation?.allowInstalledMetadataWithoutLicence
      && !['Trial','Licensed'].includes(installation.LicenceStatus__c))) continue;
    for(const definition of [...(pkg.objects??[]),...(pkg.extendObjects??[])]) {
      const object=(after.objects??[]).find(item=>item.apiName===definition.apiName);
      if(!object)continue;
      if(!oldObjects.has(object.apiName) && !Object.hasOwn(objectPermissions,object.apiName)) {
        objectPermissions[object.apiName]={read:true,create:true,edit:true,delete:true,viewAll:true,modifyAll:true};
        changed=true;
      }
      const oldFields=new Set((oldObjects.get(object.apiName)?.fields??[]).map(field=>field.apiName));
      for(const field of definition.fields??[]) {
        if(oldFields.has(field.apiName) ||
          !(object.fields??[]).some(item=>item.apiName===field.apiName))continue;
        const key=object.apiName+'.'+field.apiName;
        if(Object.hasOwn(fieldPermissions,key))continue;
        fieldPermissions[key]={read:true,edit:true};
        changed=true;
      }
    }
    for(const app of pkg.apps??[]) {
      if(oldApps.has(app.apiName) || Object.hasOwn(appPermissions,app.apiName))continue;
      if(!(after.apps??[]).some(item=>item.apiName===app.apiName))continue;
      appPermissions[app.apiName]=true;changed=true;
    }
  }
  if(!changed)return after;
  const permissionSets=[...after.accessControl.permissionSets];
  permissionSets[policyIndex]={...policy,objectPermissions,fieldPermissions,appPermissions};
  return {...after,accessControl:{...after.accessControl,permissionSets}};
}

/**
 * Reconcile missing Object and Field grants on the tenant-scoped OneEngine
 * Tenant Developer policy for ALL registered tenant objects. Run after metadata
 * installation/reconciliation so newly added and pre-existing fields are
 * covered. Respect explicit entries, including intentionally denied access,
 * and never alter assignments or cross-tenant/platform permissions.
 */
export function reconcileDeviceDeveloperGrant(tenant) {
  const sets=tenant.accessControl?.permissionSets??[];
  const index=sets.findIndex(item=>item.id==='oneengine-tenant-developer');
  if(index<0)return tenant;
  const policy=sets[index];
  const objectPermissions={...(policy.objectPermissions??{})};
  const fieldPermissions={...(policy.fieldPermissions??{})};
  let changed=false;
  for(const object of tenant.objects??[]) {
    if(!object?.apiName)continue;
    if(!Object.hasOwn(objectPermissions,object.apiName)) {
      objectPermissions[object.apiName]={
        read:true,create:true,edit:true,delete:true,viewAll:true,modifyAll:true
      };
      changed=true;
    }
    for(const field of object.fields??[]) {
      if(!field?.apiName)continue;
      const key=object.apiName+'.'+field.apiName;
      if(Object.hasOwn(fieldPermissions,key))continue;
      fieldPermissions[key]={read:true,edit:true};
      changed=true;
    }
  }
  if(!changed)return tenant;
  const permissionSets=[...sets];
  permissionSets[index]={...policy,objectPermissions,fieldPermissions};
  return {...tenant,accessControl:{...tenant.accessControl,permissionSets}};
}
