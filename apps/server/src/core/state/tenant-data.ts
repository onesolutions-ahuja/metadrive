import { reconcileInstalledAppSeeds } from '../../seeders/apps.mjs';
import { ensureBundledAppComponents } from '../../bundled-app-components.mjs';
import type { TenantData, PlatformState } from './types.js';
import type { loadAppSeedCatalog } from '../../seeders/catalog.mjs';
import type { createPlatformStateStore } from './store.js';

export function createTenantDataService(deps: {
  platformStore: ReturnType<typeof createPlatformStateStore>;
  provisioningPendingTenants: ReadonlySet<string>;
  installableAppCatalog: ReturnType<typeof loadAppSeedCatalog>;
  bundledCustomComponentsPath: string;
  persistState: (snapshot: PlatformState) => void;
}) {
  function tenantIsActive(tenantId: string): boolean {
    return !deps.provisioningPendingTenants.has(tenantId)
      && (deps.platformStore.state.tenantRegistry[tenantId]?.status ?? 'ACTIVE') === 'ACTIVE';
  }

  function tenantData(tenantId: string): TenantData | undefined {
    return tenantIsActive(tenantId) ? deps.platformStore.state.tenants[tenantId] : undefined;
  }

  function persistTenantRecords(tenantId: string, tenant: TenantData): void {
    const currentSequences = deps.platformStore.state.tenants[tenantId]?.autoNumberSequences ?? {};
    const autoNumberSequences = { ...tenant.autoNumberSequences };
    for (const [key, sequence] of Object.entries(currentSequences)) {
      autoNumberSequences[key] = Math.max(autoNumberSequences[key] ?? 0, sequence);
    }
    const updatedTenant = reconcileInstalledAppSeeds({ ...tenant, autoNumberSequences }, deps.installableAppCatalog, tenantId) as TenantData;
    const libraryComponents = ensureBundledAppComponents(deps.platformStore.state.libraryComponents,
      updatedTenant, deps.installableAppCatalog, deps.bundledCustomComponentsPath);
    const nextState = { ...deps.platformStore.state, libraryComponents, tenants: { ...deps.platformStore.state.tenants, [tenantId]: updatedTenant } };
    deps.persistState(nextState);
    deps.platformStore.state = nextState;
  }
  return { tenantIsActive, tenantData, persistTenantRecords };
}
