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
  // Isolated tests and recovery harnesses use their own JSON state, not the verified
  // production SQL dataset. Never strip their required tenant/RBAC fixtures.
  if (process.env.NODE_ENV === 'test' || process.env.METADRIVE_TEST_MODE === 'true' || process.env.METADRIVE_DATA_PATH) return snapshot;
  return {
    ...snapshot,
    users: [],
    tenants: Object.fromEntries(Object.entries(snapshot.tenants).map(([tenantId, tenant]) => [
      tenantId,
      { ...tenant, ...(tenantId === 'unesolutions-dev' ? { objects: tenant.objects.filter(object => !sqlMigratedSeedObjects.has(object.apiName)), accessControl: { ...tenant.accessControl, profiles: [], permissionSets: [], permissionSetGroups: [], roles: [], publicGroups: [], queues: [], sharingRules: [], users: [] }, sharingSettings: {}, records: {}, flows: [], pages: [], apps: [], connectorSettings: [], connectorDefinitions: [], autoNumberSequences: {} } : {}) }
    ]))
  };
}
