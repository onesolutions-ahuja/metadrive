import type { z } from 'zod';
import { readFileSync } from 'node:fs';
import { repairHistoricPackageRecordAudits, repairPackagedAppPageAssignments, retireUninstalledPackageMetadata } from '../../installable-app-packages.mjs';
import { migrateLegacyWhatsappRecords, migrateLegacyWhatsappFlow, addStarterBeautyAlias, legacyWhatsappObjectApiName } from '../../communication-unification.js';
import { defaultRoles, roleApiNameForName, roleIdForName, profileIdForRole } from '../../modules/security/role-helpers.js';
import { randomUUID } from 'node:crypto';
import { migrateAutoNumberSequences } from '../../modules/records/auto-number.js';
import { defaultAutomationSettings } from '../../automation-policy.js';
import { RECOVERY_FLOW_API, defaultRecoveryFlowDefinition } from '../../recovery-flow.js';
import { seedProtectedAdministrationPages } from '../../modules/metadata/platform-admin-pages.mjs';
import { pruneRetiredTrustedComponents } from '../../bundled-app-components.mjs';
import { findObjectDependencies } from '../../modules/objects/dependencies.js';
import { removeObjectMetadata } from '../../modules/objects/remove-object.js';
import type { PlatformState } from './types.js';
import { restoreMissingCoreAdministratorGrants } from '../../seeders/repair-core-administrator-grants.js';
import type { CreateStateHydrationDependencies } from '../../index.js';

export function createStateHydration(deps: CreateStateHydrationDependencies) {
  const initialState: PlatformState = {
    platformPolicies: {}, platformPolicyAudit: [], tenantRegistry: {}, tenantManagementAudit: [], tenants: {}, libraryComponents: [],
    users: [], refreshSessions: [], revokedAccessTokens: {}
  };

  function migrateStoredLeadStreetField(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const state = value as Record<string, unknown>;
    if (!state.tenants || typeof state.tenants !== 'object' || Array.isArray(state.tenants)) return false;
    const streetField = deps.baseObjects.find((item) => item.apiName === 'Lead')
      ?.fields.find((field) => field.apiName === 'Street');
    if (!streetField) throw new Error('Standard Lead Street field metadata is missing');
    let changed = false;
    for (const tenant of Object.values(state.tenants as Record<string, unknown>)) {
      if (!tenant || typeof tenant !== 'object' || Array.isArray(tenant)) continue;
      const objects = (tenant as Record<string, unknown>).objects;
      if (!Array.isArray(objects)) continue;
      const lead = objects.find((object) => object && typeof object === 'object'
        && !Array.isArray(object) && (object as Record<string, unknown>).apiName === 'Lead');
      if (!lead || typeof lead !== 'object' || Array.isArray(lead)) continue;
      const leadRecord = lead as Record<string, unknown>;
      if (!Array.isArray(leadRecord.fields)
        || leadRecord.fields.some((field) => field && typeof field === 'object'
          && !Array.isArray(field) && (field as Record<string, unknown>).apiName === 'Street')) continue;
      leadRecord.fields = [...leadRecord.fields, structuredClone(streetField)];
      changed = true;
    }
    return changed;
  }

  // Legacy snapshot reads retain compatibility; metadata writes stay strict.
  function parsePersistedPlatformState(raw: unknown): z.infer<typeof deps.stateSchema> {
    return deps.persistedMetadataReadMode.parse(deps.stateSchema, raw);
  }

  function loadState(sqlState?: unknown): PlatformState {
    try {
      const storedState: unknown = sqlState ?? JSON.parse(readFileSync(deps.dataPath, 'utf8'));
      const leadStreetFieldAdded = migrateStoredLeadStreetField(storedState);
      const legacySeedAuditRepaired = repairHistoricPackageRecordAudits(storedState, deps.installableAppCatalog);
      const appPageAssignmentsRepaired = repairPackagedAppPageAssignments(storedState, deps.installableAppCatalog);
      const parsed = parsePersistedPlatformState(storedState);
      const tenants = Object.fromEntries(Object.entries(parsed.tenants).map(([tenantId, tenant]) => {
        const consolidationReady = process.env.METADRIVE_UNIFIED_CONNECTORS === 'true'
          && Boolean(process.env.METADRIVE_CREDENTIAL_KEYS && process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID);
        const retiredConnectorObjects = new Set(['UneConnector__c', 'ConnectorProvider__c', 'IntegrationConnection__c']);
        const storedObjects = tenant.objects.filter((object) => !consolidationReady || !retiredConnectorObjects.has(object.apiName)).map((object) => {
          const ensured = deps.withObjectDefaults(deps.ensureLeadStreetField(deps.ensureCommunicationFields(object)));
          const baseline = deps.baseObjects.find((candidate) => candidate.apiName === object.apiName);
          if (baseline?.listViewFilter && !ensured.listViewFilter) {
            const legacyDefaultColumns = object.fields.slice(0, 5).map((field) => field.apiName);
            const existingColumns = object.searchLayouts?.searchResults;
            const unchangedStarterColumns = !existingColumns
              || (existingColumns.length === legacyDefaultColumns.length
                && existingColumns.every((name, index) => name === legacyDefaultColumns[index]));
            // Populate new metadata only for an untouched starter layout.
            if (unchangedStarterColumns) return {
              ...ensured, searchLayouts: {
                ...ensured.searchLayouts,
                searchResults: baseline.searchLayouts?.searchResults ?? existingColumns
              },
              listViewFilter: baseline.listViewFilter
            };
          }
          if (!baseline || !['ConnectorProvider__c', 'IntegrationConnection__c', 'Connector_App__c'].includes(object.apiName)) return ensured;
          return {
            ...ensured,
            fields: [
              ...ensured.fields,
              ...baseline.fields.filter((field) => !ensured.fields.some((existing) => existing.apiName === field.apiName))
            ]
          };
        });
        const objects = [
          ...storedObjects,
          ...deps.baseObjects.filter((object) => (!consolidationReady ? ['Campaign', 'UneConnector__c', 'ConnectorProvider__c', 'IntegrationConnection__c', 'Communication_Records__c'] : ['Campaign', 'Communication_Records__c', 'Connector_App__c']).includes(object.apiName)
            && !storedObjects.some((stored) => stored.apiName === object.apiName)).map(deps.withObjectDefaults)
        ];
        const records = migrateLegacyWhatsappRecords(tenant.records ?? {});
        const ownerId = parsed.users.find((user) => user.tenantId === tenantId && !user.disabled)?.id ?? 'system';
        records.Connector_App__c = deps.ensureConnectorAppRecords(records.Connector_App__c, ownerId);
        if (!consolidationReady && !(records.UneConnector__c?.length)) records.UneConnector__c = deps.connectorRecords(tenant.connectorSettings, ownerId);
        const previousProviderRecords = records.ConnectorProvider__c ?? [];
        const connectorDefinitions = (tenant.connectorDefinitions ?? structuredClone(deps.defaultConnectorDefinitions)).map((definition) => {
          const previousRecord = previousProviderRecords.find((record) => record.ConnectorKey__c === definition.connectorKey);
          const baseline = deps.defaultConnectorDefinitions.find((candidate) => candidate.connectorKey === definition.connectorKey);
          if (previousRecord?.Test__c === undefined && !definition.test && baseline?.test
            && definition.authType === baseline.authType && definition.baseUrl === baseline.baseUrl) {
            return { ...definition, test: baseline.test };
          }
          return definition;
        });
        records.ConnectorProvider__c = connectorDefinitions.flatMap((definition) => {
          const previous = previousProviderRecords.find((record) => record.ConnectorKey__c === definition.connectorKey);
          if (!previous) return deps.connectorDefinitionRecords([definition], ownerId);
          return [{
            ...previous,
            AuthCredential__c: definition.authCredential ?? '',
            Test__c: definition.test ? JSON.stringify(definition.test) : ''
          }];
        });
        const previousConnections = records.IntegrationConnection__c ?? [];
        records.IntegrationConnection__c = (tenant.integrationConnections ?? []).map((connection) =>
          deps.integrationConnectionRecord(connection, String(previousConnections.find((record) => record.Id === connection.id)?.OwnerId ?? ownerId)));
        const migratedCredentials = deps.migrateUneConnectorCredentials(tenantId, records.UneConnector__c ?? [], connectorDefinitions,
          deps.seedWhatsappDummyCredential(tenantId, tenant.namedCredentials ?? []));
        if (consolidationReady) {
          // Retire duplicate Object Manager records only once their configurations have
          // reached the encrypted tenant-scoped credential store.
          const legacy = records.UneConnector__c ?? [];
          const migratedNames = new Set(migratedCredentials.map((credential) => credential.label.toLowerCase()));
          if (legacy.every((record) => {
            const label = String(record.Name ?? '').toLowerCase();
            return migratedNames.has(label)
              || (label === 'email' && migratedCredentials.some((credential) => credential.protocol === 'SMTP'))
              || (label === 'whatsapp' && migratedCredentials.some((credential) => credential.name === 'WhatsApp_Dummy'));
          })) {
            delete records.UneConnector__c;
            delete records.ConnectorProvider__c;
            delete records.IntegrationConnection__c;
          } else {
            throw new Error('Connector consolidation did not migrate all legacy configuration records');
          }
        }
        const defaultProfiles = deps.buildDefaultProfiles(objects, tenant.accessControl.permissionSets);
        const connectorObjectNames = ['UneConnector__c', 'ConnectorProvider__c', 'IntegrationConnection__c', 'Communication_Records__c', 'Connector_App__c'];
        const connectorObjectPermissions = Object.fromEntries(connectorObjectNames.map((apiName) => [apiName, { ...deps.fullObjectPermissions }]));
        const connectorFieldPermissions = Object.fromEntries(objects
          .filter((object) => connectorObjectNames.includes(object.apiName))
          .flatMap((object) => object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: true, edit: true }])));
        const profiles = [
          ...defaultProfiles.filter((profile) => !tenant.accessControl.profiles.some((existing) => existing.id === profile.id)),
          ...tenant.accessControl.profiles
        ].map((profile) => profile.id === 'system-administrator'
          ? {
            ...profile,
            systemPermissions: [...new Set([...profile.systemPermissions, ...deps.systemAdminPermissions])],
            objectPermissions: { ...connectorObjectPermissions, ...profile.objectPermissions },
            fieldPermissions: {
              ...connectorFieldPermissions,
              ...profile.fieldPermissions
            }
          }
          : profile.id === 'sales-manager'
            ? { ...profile, objectPermissions: { ...profile.objectPermissions, Campaign: profile.objectPermissions.Campaign ?? { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false } } }
            : profile);
        const roles = [
          ...defaultRoles().filter((role) => !tenant.accessControl.roles.some((existing) => existing.id === role.id)),
          ...tenant.accessControl.roles.map((role) => ({ ...role, apiName: role.apiName ?? roleApiNameForName(role.name) }))
        ];
        const profileIds = new Set(profiles.map((profile) => profile.id));
        const accessUsers = tenant.accessControl.users.map((user) => ({
          ...user,
          roleId: user.roleId && roles.some((role) => role.id === user.roleId)
            ? user.roleId : roleIdForName(user.role, roles),
          profileId: user.role === 'System Administrator' ? 'system-administrator' : user.profileId && profileIds.has(user.profileId) ? user.profileId : profileIdForRole(user.role, profiles)
        }));
        // The login identity store is authoritative for tenant membership. Keep every
        // authenticated tenant identity represented in RBAC without replacing existing grants.
        const syncedAccessUsers = [
          ...accessUsers,
          ...parsed.users.filter((identity) => identity.tenantId === tenantId
            && !accessUsers.some((entry) => entry.id === identity.id)).map((identity) => ({
            id: identity.id,
            name: identity.name,
            username: identity.email,
            locale: 'en-GB',
            timeZone: 'Europe/London',
            role: identity.role,
            roleId: roleIdForName(identity.role, roles),
            profileId: profileIdForRole(identity.role, profiles),
            permissionSetIds: identity.permissionSetIds.filter((id) => tenant.accessControl.permissionSets.some((set) => set.id === id)),
            permissionSetGroupIds: identity.permissionSetGroupIds,
          }))
        ];
        const dashboardFolders = [...(tenant.dashboardFolders ?? [])];
        const reportFolders = [...(tenant.reportFolders ?? [])];
        const legacyReportFolderId = tenant.reports.length
          ? (reportFolders.find((folder) => folder.label === 'Legacy Reports')?.id ?? randomUUID())
          : '';
        if (tenant.reports.length && !reportFolders.some((folder) => folder.id === legacyReportFolderId)) {
          const now = new Date().toISOString();
          reportFolders.push({
            id: legacyReportFolderId,
            label: 'Legacy Reports',
            parentFolderId: null,
            ownerUserId: ownerId,
            shares: [],
            visibility: 'All Users',
            createdAt: now,
            updatedAt: now
          });
        }
        const reports = tenant.reports.map((report) => report.folderId && reportFolders.some((folder) => folder.id === report.folderId)
          ? report
          : { ...report, folderId: legacyReportFolderId || null });
        const legacyFolderIds = new Map<string, string>();
        const dashboards = tenant.dashboards.map((dashboard) => {
          if (dashboard.folderId) return dashboard;
          const folderKey = `${dashboard.ownerUserId}\0${dashboard.folderName.toLocaleLowerCase()}`;
          let folderId = legacyFolderIds.get(folderKey);
          if (!folderId) {
            folderId = randomUUID();
            legacyFolderIds.set(folderKey, folderId);
            const now = new Date().toISOString();
            dashboardFolders.push({
              id: folderId,
              label: dashboard.folderName,
              parentFolderId: null,
              ownerUserId: dashboard.ownerUserId,
              shares: [],
              createdAt: now,
              updatedAt: now
            });
          }
          return { ...dashboard, folderId };
        });
        return [tenantId, {
        ...tenant,
        records,
        autoNumberSequences: migrateAutoNumberSequences(objects, records, tenant.autoNumberSequences),
        apps: tenant.apps,
        fieldHistory: tenant.fieldHistory ?? [],
        interviews: tenant.interviews ?? [],
        flowLogs: tenant.flowLogs ?? [],
        scheduleRuns: tenant.scheduleRuns ?? {},
        scheduleRetries: tenant.scheduleRetries ?? {},
        automationSettings: tenant.automationSettings ?? { ...defaultAutomationSettings },
        notifications: tenant.notifications ?? [],
        approvalRequests: tenant.approvalRequests ?? [],
        approvalProcesses: tenant.approvalProcesses ?? [],
        namedCredentials: migratedCredentials,
        connectorDefinitions,
        integrationConnections: tenant.integrationConnections ?? [],
        dashboards,
        dashboardFolders,
        reportFolders,
        dashboardTerritories: tenant.dashboardTerritories ?? [],
        dashboardSnapshots: tenant.dashboardSnapshots ?? [],
        dashboardSubscriptions: tenant.dashboardSubscriptions ?? [],
        reports,
        sharingSettings: Object.fromEntries(objects.map((object) => [
          object.apiName,
          tenant.sharingSettings?.[object.apiName] ?? { defaultAccess: 'Private' as const, grantAccessUsingHierarchies: true }
        ])),
        recordShares: tenant.recordShares ?? [],
        campaignMembers: tenant.campaignMembers ?? [],
        activities: (tenant.activities ?? []).map((activity) => deps.recordActivitySchema.parse(activity)),
        chatterPosts: (tenant.chatterPosts ?? []).map((post) => deps.chatterPostSchema.parse(post)),
        accessControl: {
          ...tenant.accessControl,
          profiles: profiles.map((profile) => profile.id === 'system-administrator'
            ? { ...profile, objectPermissions: restoreMissingCoreAdministratorGrants({ ...profile.objectPermissions, Campaign: profile.objectPermissions.Campaign ?? { ...deps.fullObjectPermissions } }, objects, deps.fullObjectPermissions) }
            : profile.id === 'sales-manager'
              ? { ...profile, objectPermissions: { ...profile.objectPermissions, Campaign: profile.objectPermissions.Campaign ?? { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false } } }
              : profile),
          roles,
          users: syncedAccessUsers,
          permissionSets: tenant.accessControl.permissionSets.map((set) => set.id === 'system-administrator'
            ? {
              ...set,
              objectPermissions: restoreMissingCoreAdministratorGrants({ ...connectorObjectPermissions, ...set.objectPermissions, Campaign: set.objectPermissions.Campaign ?? { ...deps.fullObjectPermissions } }, objects, deps.fullObjectPermissions),
              fieldPermissions: { ...Object.fromEntries(objects.flatMap((object) => object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: true, edit: true }]))), ...connectorFieldPermissions, ...set.fieldPermissions }
            }
            : (set.id === 'oneengine' || set.id === 'oneengine-tenant-developer')
              ? { ...set, objectPermissions: restoreMissingCoreAdministratorGrants(set.objectPermissions, objects, deps.fullObjectPermissions) }
            : set.id === 'sales-user'
              ? { ...set, objectPermissions: { ...set.objectPermissions, Campaign: set.objectPermissions.Campaign ?? { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false } } }
              : set.id === 'support-agent'
                ? { ...set, systemPermissions: [...new Set([...set.systemPermissions, ...deps.supportPermissions])] }
              : set),
        },
        objects,
        flows: [...tenant.flows,
          ...(tenant.flows.some((f) => f.apiName === RECOVERY_FLOW_API) ? [] : [deps.flowSchema.parse(defaultRecoveryFlowDefinition())]),
          ...deps.connectorAppCatalog.flows.filter((definition) => !tenant.flows.some((existingFlow) => existingFlow.apiName === definition.apiName)),
          ...(tenant.flows.some((existingFlow) => existingFlow.apiName === 'WA_ROUTER') ? [] : [deps.whatsappRouterFlow()]),
          ...(tenant.flows.some((existingFlow) => existingFlow.apiName === 'WA_CONTEXT') ? [] : [deps.whatsappContextFlow()])
        ].map(migrateLegacyWhatsappFlow).map(addStarterBeautyAlias),
        pages: seedProtectedAdministrationPages(tenant).pages.map((page) => ({
          ...page,
          activationAssignments: page.activationAssignments ?? (page.status === 'Active' && page.pageType === 'Record Page' ? [
            { id: `${page.apiName}-default-desktop`, scope: 'Org Default' as const, appId: null, profileId: null, recordTypeId: null, formFactors: ['Desktop' as const] },
            { id: `${page.apiName}-default-phone`, scope: 'Org Default' as const, appId: null, profileId: null, recordTypeId: null, formFactors: ['Phone' as const] }
          ] : [])
        }))
      }]; }));
      const tenantsWithLibraryManagement = Object.fromEntries(Object.entries(tenants).map(([tenantId, tenant]) => [tenantId, {
        ...tenant,
        accessControl: {
          ...tenant.accessControl,
          users: tenant.accessControl.users.map((user) => ({ ...user, permissionSetIds: user.permissionSetIds.filter((id) => id !== 'oneengine-named-credentials') })),
          permissionSets: tenant.accessControl.permissionSets.map((set) => set.id === 'system-administrator'
            ? {
              ...set,
              systemPermissions: [...new Set([...set.systemPermissions, ...deps.systemAdminPermissions])],
              objectPermissions: { ...set.objectPermissions, UneConnector__c: (set.objectPermissions as Record<string, typeof deps.fullObjectPermissions>).UneConnector__c ?? { ...deps.fullObjectPermissions } },
              fieldPermissions: {
                ...Object.fromEntries((tenant.objects.find((object) => object.apiName === 'UneConnector__c')?.fields ?? []).map((field) => [
                  `UneConnector__c.${field.apiName}`, { read: true, edit: true }
                ])),
                ...set.fieldPermissions
              }
            }
            : set.id === 'support-agent'
              ? { ...set, systemPermissions: [...new Set([...set.systemPermissions, ...deps.supportPermissions])] }
            : set).filter((set) => set.id !== 'oneengine-named-credentials')
        }
      }]));
      const migrated: PlatformState = {
        ...parsed,
        users: parsed.users.map((user) => ({ ...user, permissionSetIds: user.permissionSetIds.filter((id) => id !== 'oneengine-named-credentials') })),
        tenants: Object.fromEntries(Object.entries(tenantsWithLibraryManagement).map(([tenantId, tenant]) => [
          tenantId, retireUninstalledPackageMetadata(tenant, deps.installableAppCatalog)
        ])),
        libraryComponents: pruneRetiredTrustedComponents(parsed.libraryComponents ?? [], deps.installableAppCatalog)
      };
      // One-time, fail-closed retirement of the superseded WhatsApp object.
      // The unified Communication Records object remains authoritative.
      for (const [tenantId, tenant] of Object.entries(migrated.tenants)) {
        if (!tenant.objects.some((object) => object.apiName === legacyWhatsappObjectApiName)) continue;
        const recordsRemaining = (tenant.records[legacyWhatsappObjectApiName] ?? []).length;
        const dependencies = findObjectDependencies(tenant, legacyWhatsappObjectApiName);
        if (recordsRemaining > 0 || dependencies.length > 0) {
          console.warn('Retaining legacy WhatsApp metadata; object still has records or dependencies', {
            tenantId, recordsRemaining, dependencyCount: dependencies.length
          });
          continue;
        }
        migrated.tenants[tenantId] = removeObjectMetadata(tenant, legacyWhatsappObjectApiName);
        console.info('Retired unused legacy WhatsApp object metadata', { tenantId });
      }
      if (!deps.maintenanceMode && (leadStreetFieldAdded || legacySeedAuditRepaired
        || appPageAssignmentsRepaired || JSON.stringify(migrated) !== JSON.stringify(parsed))) deps.persistState(migrated);
      return migrated;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        if (!deps.maintenanceMode) deps.persistState(initialState);
        return structuredClone(initialState);
      }
      throw new Error(`Cannot load platform state from ${deps.dataPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { loadState, parsePersistedPlatformState };
}
