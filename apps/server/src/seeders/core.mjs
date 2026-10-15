/**
 * MetaDrive Core metadata seeder. Accepts the existing canonical Core template
 * rather than copying Object, Field, Component, Flow or RBAC definitions.
 * Customer records, users, credentials and sessions are never part of metadata seeds.
 */
export function coreMetadataSeed(template) {
  if (!template || typeof template !== 'object') throw Error('Core metadata template required');
  const source = structuredClone(template);
  return {
    objects: source.objects ?? [],
    pages: source.pages ?? [],
    flows: source.flows ?? [],
    // Required tenant runtime/metadata collections must exist even in a fresh tenant.
    apps: source.apps ?? [],
    dashboards: source.dashboards ?? [],
    dashboardFolders: source.dashboardFolders ?? [],
    dashboardTerritories: source.dashboardTerritories ?? [],
    dashboardSnapshots: [],
    dashboardSubscriptions: [],
    reports: source.reports ?? [],
    reportFolders: source.reportFolders ?? [],
    platformEvents: source.platformEvents ?? [],
    platformEventMessages: [],
    approvalProcesses: source.approvalProcesses ?? [],
    approvalRequests: [],
    emailAlerts: source.emailAlerts ?? [],
    connectorSettings: source.connectorSettings ?? {},
    connectorDefinitions: source.connectorDefinitions ?? [],
    campaignMembers: [],
    activities: [],
    chatterPosts: [],
    fieldHistory: [],
    securityAudit: [],
    mfaPolicy: source.mfaPolicy ?? {mode: 'Off'},
    passwordRecovery: source.passwordRecovery ?? {smtpCredentialId: '', fromEmail: ''},
    libraryComponents: source.libraryComponents ?? [],
    accessControl: {...(source.accessControl ?? {}), users: []},
    sharingSettings: source.sharingSettings ?? {},
    currencySettings: source.currencySettings ?? {},
    automationSettings: source.automationSettings ?? {},
    // Dynamic runtime/business data is deliberately excluded.
    records: {},
    recordShares: [],
    users: [],
    notifications: [],
    interviews: [],
    flowLogs: [],
    scheduleRuns: {},
    scheduleRetries: {},
    autoNumberSequences: {},
    namedCredentials: [],
    integrationConnections: []
  };
}
/** Add missing definitions only. Never overwrite tenant customizations. */
export function mergeCoreMetadata(tenant, seed) {
  const merged = structuredClone(tenant);
  // Merge additions only. Tenant edits, deletions of individual properties and
  // administrator-modified permission grants are never replaced by a seed.
  const names = ['objects', 'pages', 'flows'];
  for (const name of names) {
    const current = merged[name] ?? [];
    const additions = [];
    const existing = new Set(current.map(item => item.apiName));
    for (const definition of seed[name] ?? []) {
      const key = definition?.apiName;
      if (typeof key !== 'string' || !key.trim())
        throw Error('Core ' + name + ' seed entry requires a stable apiName');
      if (existing.has(key)) continue;
      existing.add(key);
      additions.push(structuredClone(definition));
    }
    merged[name] = [...current, ...additions];
  }
  // RBAC initialization is for NEW tenants only; never alter existing access grants.
  if (!merged.accessControl) merged.accessControl = structuredClone(seed.accessControl);
  if (!merged.sharingSettings) merged.sharingSettings = structuredClone(seed.sharingSettings);
  return merged;
}

/**
 * Initialise a separately editable tenant-developer OneEngine policy once.
 * Its initial full tenant metadata grant mirrors the canonical administrator
 * permission set, not platform/operator privileges. Subsequent reseeds never
 * replace edited tenant policies.
 */
export function seedInitialTenantDeveloperPolicy(accessControl) {
  const result=structuredClone(accessControl);
  const sets=result.permissionSets??[];
  if (sets.some(set=>set.id==='oneengine-tenant-developer')) return result;
  const admin=sets.find(set=>set.id==='system-administrator');
  if (!admin) throw Error('Missing canonical administrator permission template');
  result.permissionSets=[...sets,{
    ...structuredClone(admin),
    id:'oneengine-tenant-developer',
    apiName:'OneEngine_Tenant_Developer',
    label:'OneEngine Tenant Developer',
    description:'Initial full tenant administration; no platform scope or RBAC bypass.'
  }];
  return result;
}

/** Reuse the canonical platform Core factory on fresh tenant provisioning. */
export function initializeTenantCore(template, {authorizedUserIds=[], trustedProvisioningDefaults=false}={}) {
  // Only an identity newly verified and explicitly authorized by the tenant
  // provisioner can enter this fresh tenant. Never copy template/sample users.
  const seed=coreMetadataSeed(template);
  const allowed=new Set(authorizedUserIds);
  // New-tenant provisioning supplies fresh, server-constructed defaults with
  // the authorized administrator. Retain its required state shape; generic
  // template seeding (no authorized IDs) remains metadata-only.
  const initialKeys=[
    'mfaPolicy','passwordRecovery','securityAudit','objects','flows',
    'platformEvents','platformEventMessages','pages','apps','dashboards',
    'dashboardFolders','reportFolders','dashboardTerritories','dashboardSnapshots',
    'dashboardSubscriptions','reports','currencySettings','sharingSettings',
    'recordShares','campaignMembers','activities','chatterPosts','notifications',
    'approvalRequests','approvalProcesses','records','autoNumberSequences',
    'fieldHistory','interviews','flowLogs','scheduleRuns','scheduleRetries',
    'automationSettings','emailAlerts','connectorSettings','connectorDefinitions'
  ];
  // Trusted defaults may provide metadata and configuration, but cannot
  // reintroduce example transactions or private user/security events.
  const excludedProvisionedKeys = new Set([
    'records','recordShares','approvalRequests','platformEventMessages',
    'dashboardSnapshots','dashboardSubscriptions','campaignMembers',
    'activities','chatterPosts','notifications','fieldHistory',
    'interviews','flowLogs','scheduleRuns','scheduleRetries',
    'autoNumberSequences','securityAudit'
  ]);
  const provisioned=allowed.size>0 && trustedProvisioningDefaults ? Object.fromEntries(initialKeys
    .filter(key=>!excludedProvisionedKeys.has(key) && Object.hasOwn(template,key))
    .map(key=>[key,structuredClone(template[key])])) : seed;
  // Preserve only the server-generated, secret-free WhatsApp placeholder for
  // freshly provisioned tenants; never inherit real tenant credentials.
  const placeholders=allowed.size>0 && trustedProvisioningDefaults ? (template.namedCredentials??[])
    .filter(item=>item.name==='WhatsApp_Dummy' && item.authType==='None'
      && /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/000000000000000\/?$/.test(item.baseUrl??''))
    .map(item=>structuredClone(item)) : [];
  // This path is called with newly generated, server-constructed defaults.
  // Preserve only connector catalogue/configuration metadata needed for fresh
  // tenant discovery and legacy connector migration. Never copy ordinary
  // business objects, histories, sessions, or customer transactions.
  const trustedConnectorObjects = new Set([
    'Connector_App__c', 'UneConnector__c', 'ConnectorProvider__c'
  ]);
  const connectorSeedRecords = allowed.size>0 && trustedProvisioningDefaults
    ? Object.fromEntries(Object.entries(template.records ?? {})
      .filter(([apiName])=>trustedConnectorObjects.has(apiName))
      .map(([apiName, rows])=>[apiName,structuredClone(rows)]))
    : {};
  return {...seed,...provisioned,
    records:connectorSeedRecords,
    namedCredentials:placeholders,
    users:[],
    accessControl:{
      ...(seed.accessControl.permissionSets?.some(set=>set.id==='system-administrator')
        ? seedInitialTenantDeveloperPolicy(seed.accessControl) : seed.accessControl),
      users:(template.accessControl?.users??[])
        .filter(user=>allowed.has(user.id)).map(user=>structuredClone(user))
    }
  };
}


const SHARED_COLLECTIONS = ['objects','pages','flows','apps','reports','dashboards',
  'platformEvents','approvalProcesses','connectorDefinitions','libraryComponents'];
const KEY_FIELDS = ['apiName','componentApiName','name'];

/**
 * A shared dependency is metadata only, never tenant data or credentials.
 * Existing definitions are authoritative, including owner-adjusted permissions.
 */
export function mergeSharedDependency(tenant, dependency) {
  if (!dependency || typeof dependency !== 'object' || Array.isArray(dependency))
    throw Error('Shared dependency definition required');
  const forbidden = ['records','users','accessControl','namedCredentials',
    'integrationConnections','refreshSessions','securityAudit','recordShares'];
  for (const key of forbidden)
    if (Object.hasOwn(dependency,key))
      throw Error('Shared dependency may not seed tenant business/security state: ' + key);
  const result = mergeCoreMetadata(tenant,{
    objects:dependency.objects??[],pages:dependency.pages??[],flows:dependency.flows??[]});
  for (const name of SHARED_COLLECTIONS.filter(name=>!['objects','pages','flows'].includes(name))) {
    const existing = result[name]??[];
    if (!Array.isArray(existing) || !Array.isArray(dependency[name]??[]))
      throw Error('Shared metadata collection must be an array: '+name);
    const seen = new Set(existing.map(item=>KEY_FIELDS.map(key=>item?.[key]).find(Boolean)).filter(Boolean));
    const added=[];
    for(const item of dependency[name]??[]) {
      const id=KEY_FIELDS.map(key=>item?.[key]).find(value=>typeof value==='string'&&value.trim());
      if(!id)throw Error('Shared '+name+' definition requires stable API identity');
      if(seen.has(id))continue;
      seen.add(id);added.push(structuredClone(item));
    }
    result[name]=[...existing,...added];
  }
  return result;
}
