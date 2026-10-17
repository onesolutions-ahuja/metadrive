import { defaultRoles, roleIdForName, profileIdForRole } from '../../modules/security/role-helpers.js';
import { defaultRecoveryFlowDefinition } from '../../recovery-flow.js';
import { defaultAutomationSettings } from '../../automation-policy.js';
import type { LocalUser, TenantData } from './types.js';
import type { ObjectMetadata, AccessControl, AccessProfile, CreateTenantDefaultsDependencies } from '../../index.js';

export function createTenantDefaults(deps: CreateTenantDefaultsDependencies) {
  function buildDefaultProfiles(objects: ObjectMetadata[], permissionSets: AccessControl['permissionSets']): AccessProfile[] {
    const allAccess = Object.fromEntries(objects.map((object) => [object.apiName, { ...deps.fullObjectPermissions }]));
    const adminSet = permissionSets.find((set) => set.id === 'system-administrator');
    const adminFields = Object.fromEntries(objects.flatMap((object) => object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: true, edit: true }])));
    const salesSet = permissionSets.find((set) => set.id === 'sales-user');
    const supportSet = permissionSets.find((set) => set.id === 'support-agent');
    return [
      {
        id: 'system-administrator', label: 'System Administrator', apiName: 'System_Administrator', license: 'MetaDrive',
        description: 'Full administrative access to setup and tenant data.', isStandard: true,
        systemPermissions: [...new Set([...(adminSet?.systemPermissions ?? []), ...deps.systemAdminPermissions])],
        objectPermissions: { ...allAccess, ...(adminSet?.objectPermissions ?? {}) },
        recordTypePermissions: { ...(adminSet?.recordTypePermissions ?? {}) },
        fieldPermissions: { ...adminFields, ...(adminSet?.fieldPermissions ?? {}) }
      },
      {
        id: 'standard-user', label: 'Standard User', apiName: 'Standard_User', license: 'MetaDrive',
        description: 'Tenant user with only the access granted by assigned permission sets.', isStandard: true,
        systemPermissions: [], objectPermissions: {}, recordTypePermissions: {}, fieldPermissions: {}
      },
      ...(salesSet ? [{
        ...salesSet, id: 'sales-manager', label: 'Sales Manager', apiName: 'Sales_Manager', isStandard: false
      }] : []),
      ...(supportSet ? [{
        ...supportSet, id: 'support-agent', label: 'Support Agent', apiName: 'Support_Agent', isStandard: false
      }] : [])
    ].map((profile) => ({ ...profile, navigationDefaultAccess: 'Allow' as const }));
  }

  function defaultTenantData(admin?: Pick<LocalUser, 'id' | 'tenantId' | 'name' | 'email' | 'role' | 'permissionSetIds'>): TenantData {
    const unified = process.env.METADRIVE_UNIFIED_CONNECTORS === 'true'
      && Boolean(process.env.METADRIVE_CREDENTIAL_KEYS && process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID);
    const objects = deps.baseObjects.filter((object) => !unified || !['UneConnector__c', 'ConnectorProvider__c', 'IntegrationConnection__c'].includes(object.apiName)).map(deps.withObjectDefaults);
    const allAccess = Object.fromEntries(objects.map((object) => [object.apiName, { ...deps.fullObjectPermissions }]));
    const permissionSets = [
      { id: 'system-administrator', label: 'System Administrator', apiName: 'System_Administrator', license: 'MetaDrive', description: 'Full administrative access.', systemPermissions: deps.systemAdminPermissions, objectPermissions: allAccess, recordTypePermissions: {}, fieldPermissions: Object.fromEntries(objects.flatMap((object) => object.fields.map((field) => [`${object.apiName}.${field.apiName}`, { read: true, edit: true }]))) },
      { id: 'sales-user', label: 'Sales User', apiName: 'Sales_User', license: 'MetaDrive', description: 'Manage accounts and opportunities.', systemPermissions: deps.salesPermissions, objectPermissions: {
        Account: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false },
        Contact: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false },
        Opportunity: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false }
      }, recordTypePermissions: {}, fieldPermissions: { 'Opportunity.Amount': { read: true, edit: true }, 'Opportunity.StageName': { read: true, edit: true } } },
      { id: 'support-agent', label: 'Support Agent', apiName: 'Support_Agent', license: 'MetaDrive', description: 'Work on customer cases.', systemPermissions: deps.supportPermissions, objectPermissions: {
        Account: { read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
        Contact: { read: true, create: false, edit: false, delete: false, viewAll: false, modifyAll: false },
        Case: { read: true, create: true, edit: true, delete: false, viewAll: false, modifyAll: false }
      }, recordTypePermissions: {}, fieldPermissions: { 'Case.Priority': { read: true, edit: true }, 'Case.Status': { read: true, edit: true } }
      }
    ];
    // Dedicated, assignable OneEngine permission set for credential administration.
    // A flow author does not receive this permission merely by editing flows.
    // Named Credentials uses existing RBAC system permissions.
    const profiles = buildDefaultProfiles(objects, permissionSets);
    const accessControl = deps.accessControlSchema.parse({
      profiles,
      permissionSets,
      permissionSetGroups: [],
      roles: defaultRoles(),
      users: admin ? [{
        ...admin, username: admin.email, roleId: roleIdForName(admin.role, defaultRoles()),
        profileId: profileIdForRole(admin.role, profiles)
      }] : []
    });
    const flow = deps.flowSchema.parse({
      apiName: 'Renewal_Risk_Evaluation', label: 'Renewal Risk Evaluation', flowType: 'Record-Triggered Flow',
      status: 'Draft', versionNumber: 1, activeVersion: null, triggerObject: 'Renewal__c',
      startConfig: { trigger: 'created-or-updated', runWhen: 'after-save', entryConditions: [] },
      elements: [
        { id: 1, type: 'Start', label: 'Record-Triggered Flow', config: { trigger: 'created-or-updated', runWhen: 'after-save' } },
        { id: 2, type: 'Decision', label: 'Renewal at risk?', config: { outcomes: [{ name: 'At_Risk', label: 'At Risk', conditions: [] }, { name: 'Default', label: 'Default Outcome', conditions: [] }] } },
        { id: 3, type: 'Update Records', label: 'Update Renewal Status', config: { object: 'Renewal__c', field: 'Status__c', value: 'At Risk' } }
      ],
      connectors: [
        { id: 'connector-1', from: 1, to: 2, label: '', kind: 'normal' },
        { id: 'connector-2', from: 2, to: 3, label: 'At Risk', kind: 'normal' }
      ],
      resources: [{ name: 'recordId', label: 'Record ID', type: 'Variable', dataType: 'Text', isCollection: false, availableForInput: true, availableForOutput: false }],
      versions: []
    });
    const page = deps.pageSchema.parse({
      apiName: 'Account_Record_Page', label: 'Account Record Page', targetObject: 'Account',
      pageType: 'Record Page', template: 'header-main-sidebar', status: 'Draft', devices: ['Desktop', 'Phone'],
      components: [
        { id: 'highlights-panel', type: 'Highlights Panel', label: 'Highlights Panel', properties: { variant: 'compact' }, visible: true, region: 'header' },
        { id: 'record-tabs', type: 'Tabs', label: 'Tabs', properties: { tabs: ['Related', 'Details', 'News'] }, visible: true, region: 'main' },
        { id: 'related-list', type: 'Related List', label: 'Related List', properties: { relatedLists: ['Contacts', 'Opportunities', 'Cases'] }, visible: true, region: 'sidebar' }
      ],
      activationAssignments: [
        { id: 'account-default-desktop', scope: 'Org Default', appId: null, profileId: null, recordTypeId: null, formFactors: ['Desktop'] },
        { id: 'account-default-phone', scope: 'Org Default', appId: null, profileId: null, recordTypeId: null, formFactors: ['Phone'] }
      ]
    });
    return {
      mfaPolicy: { mode: 'Off' }, passwordRecovery: { smtpCredentialId: '', fromEmail: '' }, securityAudit: [],
      objects, flows: [flow, deps.flowSchema.parse(defaultRecoveryFlowDefinition()), deps.whatsappRouterFlow(), deps.whatsappContextFlow(), ...deps.connectorAppCatalog.flows], platformEvents: [], platformEventMessages: [], pages: [page], apps: deps.defaultLightningApps(), dashboards: [], dashboardFolders: [], reportFolders: [], dashboardTerritories: [], dashboardSnapshots: [], dashboardSubscriptions: [], reports: [], accessControl,
      currencySettings: { corporateCurrency: 'USD', standardVatRate: 20, currencies: [{ currencyIsoCode: 'USD', conversionRate: 1 }] },
      sharingSettings: Object.fromEntries(objects.map((object) => [object.apiName, {
        defaultAccess: 'Private' as const, grantAccessUsingHierarchies: true
      }])),
      recordShares: [], campaignMembers: [], activities: [], chatterPosts: [], notifications: [], approvalRequests: [], approvalProcesses: [],
      records: {
        ...(unified ? {} : {
          UneConnector__c: deps.connectorRecords(deps.defaultConnectorSettings, admin?.id ?? 'system'),
          ConnectorProvider__c: deps.connectorDefinitionRecords(deps.defaultConnectorDefinitions, admin?.id ?? 'system'),
          IntegrationConnection__c: []
        }),
        Connector_App__c: deps.ensureConnectorAppRecords([], admin?.id ?? 'system')
      },
      autoNumberSequences: {},
      fieldHistory: [], interviews: [], flowLogs: [], scheduleRuns: {}, scheduleRetries: {}, automationSettings: { ...defaultAutomationSettings }, namedCredentials: deps.seedWhatsappDummyCredential(admin?.tenantId ?? 'bootstrap', []), emailAlerts: [],
      connectorSettings: structuredClone(deps.defaultConnectorSettings),
      connectorDefinitions: structuredClone(deps.defaultConnectorDefinitions),
      integrationConnections: []
    };
  }
  return { buildDefaultProfiles, defaultTenantData };
}
