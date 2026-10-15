import {coreMetadataSeed, mergeCoreMetadata, mergeSharedDependency} from './core.mjs';
import {installedAppSeed, listSeedPackages} from './apps.mjs';
import {applyVersionedSeed} from './sql-package-ledger.mjs';

/**
 * Metadata seeder interface. AppExchange owns all installation/licence/RBAC
 * checks and calls versioned* only with an already-open SQL transaction.
 * No runtime path is installed automatically by merely creating this registry.
 */
export function createTenantSeedRegistry({coreTemplate, appCatalog}) {
  if (!coreTemplate || !appCatalog) throw Error('Core template and AppExchange catalog required');
  const registry = {
    availableApps: () => listSeedPackages(appCatalog),
    freshCore: () => coreMetadataSeed(coreTemplate),
    initializeCore: tenant => mergeCoreMetadata(tenant, coreMetadataSeed(coreTemplate)),
    installShared: (tenant, dependency) => mergeSharedDependency(tenant, dependency),
    installApp: (tenant, tenantId, appKey) => installedAppSeed(tenant, appCatalog, tenantId, appKey),
    versionedCore: (client,{tenantId,version,apply}) => applyVersionedSeed(client,{
      tenantId,kind:'core',key:'core',version,definition:coreMetadataSeed(coreTemplate),apply
    }),
    versionedShared: (client,{tenantId,key,version,definition,apply}) => applyVersionedSeed(client,{
      tenantId,kind:'shared',key,version,definition,apply
    }),
    versionedApp: (client,{tenantId,appKey,version,apply}) => {
      const pkg = (appCatalog.packages ?? []).find(item=>item.appKey===appKey);
      if (!pkg) throw Error('AppExchange package not registered: '+appKey);
      // Caller MUST already have checked installed app entitlement and OneEngine.
      return applyVersionedSeed(client,{
        tenantId,kind:'app',key:appKey,version,definition:pkg,apply
      });
    }
  };
  return registry;
}
