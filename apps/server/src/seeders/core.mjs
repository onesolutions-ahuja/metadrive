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
    libraryComponents: source.libraryComponents ?? [],
    accessControl: source.accessControl ?? {},
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
export function initializeTenantCore(template) {
  const base = structuredClone(template);
  const seed = coreMetadataSeed(template);
  return {...base, objects:seed.objects, pages:seed.pages, flows:seed.flows,
    accessControl:seed.accessControl, sharingSettings:seed.sharingSettings,
    currencySettings:seed.currencySettings, automationSettings:seed.automationSettings};
}
