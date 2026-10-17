import type { Principal } from '../../auth.js';

import type { RuntimeRecord } from '../../index.js';

type ConnectorRight = 'view' | 'edit' | 'secrets' | 'test' | 'install';
export function connectorRight(principal: Principal, right: ConnectorRight): boolean {
  // Legacy installations retain access; new profiles can grant each permission independently.
  return principal.permissions.includes('connectorApps:' + right)
    || (principal.permissions.includes('namedCredentials:manage') && principal.permissions.includes('security:manage'));
}
export function managedConnector(tenant: TenantData, credentialName: string): RuntimeRecord | undefined {
  return (tenant.records.Connector_App__c ?? []).find((item) => item.CredentialName__c === credentialName);
}
export function disableOnConnectorUninstall(tenant: TenantData, previous: RuntimeRecord, next: RuntimeRecord) {
  // Every installation transition, including reinstall, starts with callouts disabled.
  // Configuration and encrypted secret bytes are preserved.
  if (previous.Installed__c !== next.Installed__c) {
    tenant.namedCredentials = tenant.namedCredentials.map((credential) =>
      credential.name === previous.CredentialName__c ? { ...credential, enabled: false } : credential);
  }
}
export function assertConnectorLifecycleAccess(previous: RuntimeRecord, requested: RuntimeRecord, principal: Principal) {
  if ((previous.Installed__c !== requested.Installed__c || requested.TrialRequested__c === true)
    && !connectorRight(principal, 'install')) {
    throw new Error('Missing connectorApps:install permission to install, uninstall or start a trial.');
  }
}
