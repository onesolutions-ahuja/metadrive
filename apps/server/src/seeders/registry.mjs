import {coreMetadataSeed, mergeCoreMetadata} from './core.mjs';
import {installedAppSeed, listSeedPackages} from './apps.mjs';

/** Shared registry uses existing AppExchange catalog; no duplicate package metadata. */
export function createTenantSeedRegistry({coreTemplate, appCatalog}) {
  if (!coreTemplate || !appCatalog) throw Error('Core template and AppExchange catalog required');
  return {
    availableApps: () => listSeedPackages(appCatalog),
    freshCore: () => coreMetadataSeed(coreTemplate),
    initializeCore: tenant => mergeCoreMetadata(tenant, coreMetadataSeed(coreTemplate)),
    installApp: (tenant, tenantId, appKey) => installedAppSeed(tenant, appCatalog, tenantId, appKey)
  };
}
