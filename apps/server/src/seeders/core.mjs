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
  const names = ['objects', 'pages', 'flows'];
  for (const name of names) {
    const existing = new Set((merged[name] ?? []).map(item => item.apiName));
    merged[name] = [...(merged[name] ?? []), ...(seed[name] ?? [])
      .filter(item => !existing.has(item.apiName)).map(item => structuredClone(item))];
  }
  // RBAC initialization is for NEW tenants only; never alter existing access grants.
  if (!merged.accessControl) merged.accessControl = structuredClone(seed.accessControl);
  if (!merged.sharingSettings) merged.sharingSettings = structuredClone(seed.sharingSettings);
  return merged;
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
  const provisioned=allowed.size>0 && trustedProvisioningDefaults ? Object.fromEntries(initialKeys
    .filter(key=>Object.hasOwn(template,key))
    .map(key=>[key,structuredClone(template[key])])) : seed;
  // Preserve only the server-generated, secret-free WhatsApp placeholder for
  // freshly provisioned tenants; never inherit real tenant credentials.
  const placeholders=allowed.size>0 && trustedProvisioningDefaults ? (template.namedCredentials??[])
    .filter(item=>item.name==='WhatsApp_Dummy' && item.authType==='None'
      && /^https:\/\/graph\.facebook\.com\/v\d+\.\d+\/000000000000000\/?$/.test(item.baseUrl??''))
    .map(item=>structuredClone(item)) : [];
  return {...seed,...provisioned,
    namedCredentials:placeholders,
    users:[],
    accessControl:{
      ...seed.accessControl,
      users:(template.accessControl?.users??[])
        .filter(user=>allowed.has(user.id)).map(user=>structuredClone(user))
    }
  };
}
