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
  return applyInstallableAppPackages(tenant,
    {...catalog, packages: [pkg], retiredPackages: [], retiredTrustedComponentPrefixes: []}, tenantId);
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
  return applyInstallableAppPackages(tenant,catalog,tenantId);
}
