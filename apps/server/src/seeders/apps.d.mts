import type { TenantData } from '../index.js';
export function installedAppSeed(tenant: TenantData, catalog: any, tenantId: string, appKey: string): TenantData;
export function listSeedPackages(catalog: any): Array<{ appKey: string; objects: number; pages: number; flows: number; components: number }>;
export function reconcileInstalledAppSeeds(tenant: TenantData, catalog: any, tenantId: string): TenantData;
