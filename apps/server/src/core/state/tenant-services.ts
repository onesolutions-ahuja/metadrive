import { createTenantProvisioning } from './tenant-provisioning.js';
import { createTenantBootstrap } from './bootstrap-tenant.js';
import { createTenantDataService } from './tenant-data.js';

/**
 * Orchestrates existing SQL-backed tenant services without a second CRUD or
 * provisioning engine. A failed bootstrap aborts startup before routes register.
 */
export async function initializeTenantServices(dependencies: {
  provisioning: Parameters<typeof createTenantProvisioning>[0];
  bootstrap: (service: ReturnType<typeof createTenantProvisioning>) => Parameters<typeof createTenantBootstrap>[0];
  data: (service: ReturnType<typeof createTenantProvisioning>) => Parameters<typeof createTenantDataService>[0];
  maintenanceMode: boolean;
}) {
  // Provisioning serializes local creation while SQL revisions protect concurrent writers.
  const provisioning = createTenantProvisioning(dependencies.provisioning);
  const { bootstrapTenant } = createTenantBootstrap(dependencies.bootstrap(provisioning));
  // Maintenance must never mutate persisted state.
  if (!dependencies.maintenanceMode) await bootstrapTenant();
  return { provisioning, ...createTenantDataService(dependencies.data(provisioning)) };
}
