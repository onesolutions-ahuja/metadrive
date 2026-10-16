// Generic package-entitlement primitive. Provider definitions and business actions live
// in Connector_App__c metadata and executable Flow records, never in this module.
export type ConnectorAppRecord = Record<string, unknown>;
export type CredentialIdentity = { id: string; name: string };
export type ReferencingFlow = {
  apiName: string;
  label: string;
  status: string;
  elements: Array<{ type: string; config: Record<string, unknown> }>;
};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const appName = (app: ConnectorAppRecord) => text(app.Name) || text(app.AppKey__c);

export function activeConnectorFlowReferences(
  app: ConnectorAppRecord, credentials: CredentialIdentity[], flows: ReferencingFlow[]
): string[] {
  const configuredName = text(app.CredentialName__c);
  const credential = credentials.find((item) => item.name === configuredName);
  return flows.filter((flow) => flow.status === 'Active' && flow.elements.some((element) => {
    if (element.type !== 'HTTP Callout' && element.type !== 'Action') return false;
    const config = element.config ?? {};
    const selected = text(config.namedCredentialId);
    // Dynamic references are fail-closed unless the Flow explicitly declares
    // a credential owner scope; that same scope is enforced by HTTP runtime.
    const scope = config.allowedCredentialAppKeys;
    const declaredScope = Array.isArray(scope) && scope.length > 0 && scope.every(
      (key: unknown) => typeof key === 'string' && key.length > 0
    ) ? scope as string[] : null;
    const dynamicDependency = Boolean(text(config.namedCredentialResource))
      && (!declaredScope || declaredScope.includes(text(app.AppKey__c)));
    // Also check the configured API name before a Named Credential exists.
    return (Boolean(configuredName) && selected === configuredName)
      || (Boolean(credential) && selected === credential?.id)
      || dynamicDependency;
  })).map((flow) => flow.label || flow.apiName);
}

export function connectorEntitlement(
  apps: ConnectorAppRecord[], credential: CredentialIdentity, now = new Date()
): { allowed: boolean; message: string; managed: boolean } {
  const matches = apps.filter((item) => text(item.CredentialName__c) !== '' &&
    text(item.CredentialName__c) === credential.name);
  // An ambiguous credential owner must never be authorised based on array order.
  if (matches.length > 1) return {
    allowed: false, message: 'Multiple AppExchange installations claim this credential.', managed: true
  };
  const app = matches[0];
  if (!app) return { allowed: true, message: '', managed: false };
  const name = appName(app);
  if (app.Installed__c !== true) return { allowed: false, message: name + ' must be installed in AppExchange.', managed: true };
  const licensedUntil = Date.parse(text(app.LicenceExpiresAt__c));
  const trialUntil = Date.parse(text(app.TrialExpiresAt__c));
  const activePaid = Number.isFinite(licensedUntil) && licensedUntil > now.getTime();
  const activeTrial = app.TrialUsed__c === true && Number.isFinite(trialUntil) && trialUntil > now.getTime();
  if (!activePaid && !activeTrial) return { allowed: false, message: name + ' requires a valid licence or free trial.', managed: true };
  return { allowed: true, message: '', managed: true };
}

export function applyConnectorLifecycle<T extends ConnectorAppRecord>(
  previous: T,
  requested: T,
  credentials: CredentialIdentity[],
  flows: ReferencingFlow[],
  now = new Date(),
  allowLicenceAdministration = false
): T {
  const app: ConnectorAppRecord = { ...requested };
  const protectedFields = ['TrialStartedAt__c', 'TrialExpiresAt__c', 'TrialUsed__c'];
  for (const name of protectedFields) {
    if (app[name] !== previous[name]) throw new Error(name + ' is managed by the licence engine.');
  }
  if (!allowLicenceAdministration) {
    const platformFields = ['LicenceExpiresAt__c', 'TrialDays__c', 'AppKey__c',
      'CredentialName__c', 'InstallFlow__c', 'UninstallFlow__c', 'TrialFlow__c'];
    for (const field of platformFields) {
      if (app[field] !== previous[field]) {
        throw new Error(field + ' is managed by a platform licence administrator.');
      }
    }
  }
  // The install/uninstall actions are metadata Flows; the core guard protects
  // the resulting record mutation regardless of its API entrypoint.
  if (previous.Installed__c === true && app.Installed__c === false) {
    const references = activeConnectorFlowReferences(previous, credentials, flows);
    if (references.length) throw new Error(
      'Cannot uninstall ' + appName(previous) + '. Remove it from active flows first: ' + references.join(', ')
    );
  }
  if (app.TrialRequested__c === true && previous.TrialRequested__c !== true) {
    if (app.Installed__c !== true) throw new Error('Install the app before starting its trial.');
    if (previous.TrialUsed__c === true) throw new Error('This app has already used its one-time trial.');
    const days = Number(previous.TrialDays__c);
    if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Trial duration is not valid in the app metadata.');
    const end = new Date(now.getTime() + days * 86400_000);
    app.TrialStartedAt__c = now.toISOString();
    app.TrialExpiresAt__c = end.toISOString();
    app.TrialUsed__c = true;
  }
  app.TrialRequested__c = false;
  const entitlement = connectorEntitlement([app], { id: '', name: text(app.CredentialName__c) }, now);
  app.LicenceStatus__c = app.Installed__c !== true ? 'Not Installed'
    : entitlement.allowed ? (Number.isFinite(Date.parse(text(app.LicenceExpiresAt__c))) && Date.parse(text(app.LicenceExpiresAt__c)) > now.getTime() ? 'Licensed' : 'Trial')
      : app.TrialUsed__c === true ? 'Expired' : 'Not Activated';
  return app as T;
}
