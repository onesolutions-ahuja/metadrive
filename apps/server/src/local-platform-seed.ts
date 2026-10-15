import type { PlatformState } from './index.js';

// The eleven migrated built-in object definitions are present in PostgreSQL.
// Keep them in the runtime state (including the database snapshot), but not in
// the local JSON compatibility cache/seed. Connector objects not yet migrated
// remain in the seed until their SQL migration is verified.
const sqlMigratedSeedObjects = new Set([
  'User', 'Account', 'Contact', 'Opportunity', 'Case', 'Renewal__c',
  'Sale__c', 'Campaign', 'Tenant__c', 'Global_Settings__c',
  'Communication_Records__c'
]);
export function localStateWithoutSqlObjectDefinitions(snapshot: PlatformState): PlatformState {
  return {
    ...snapshot,
    tenants: Object.fromEntries(Object.entries(snapshot.tenants).map(([tenantId, tenant]) => [
      tenantId,
      { ...tenant, objects: tenantId === 'unesolutions-dev' ? tenant.objects.filter(object => !sqlMigratedSeedObjects.has(object.apiName)) : tenant.objects }
    ]))
  };
}
