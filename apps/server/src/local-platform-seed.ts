import type { PlatformState } from './index.js';

// The migrated built-in and connector object definitions are present in PostgreSQL.
// Keep them in the runtime state (including the database snapshot), but not in
// the local JSON compatibility cache/seed. The three connector definitions have now been verified in SQL.
const sqlMigratedSeedObjects = new Set([
  'User', 'Account', 'Contact', 'Opportunity', 'Case', 'Renewal__c',
  'Sale__c', 'Campaign', 'Tenant__c', 'Global_Settings__c',
  'Communication_Records__c', 'UneConnector__c', 'ConnectorProvider__c', 'IntegrationConnection__c'
]);
export function localStateWithoutSqlObjectDefinitions(snapshot: PlatformState): PlatformState {
  return {
    ...snapshot,
    tenants: Object.fromEntries(Object.entries(snapshot.tenants).map(([tenantId, tenant]) => [
      tenantId,
      { ...tenant, ...(tenantId === 'unesolutions-dev' ? { objects: tenant.objects.filter(object => !sqlMigratedSeedObjects.has(object.apiName)), accessControl: { ...tenant.accessControl, profiles: [], permissionSets: [], permissionSetGroups: [], roles: [], publicGroups: [], queues: [], sharingRules: [], users: [] }, sharingSettings: {} } : {}) }
    ]))
  };
}
