import type { ConnectorApp } from './ConnectorAppWorkspace';

const validUntil = (date?: string) => Boolean(date && Number.isFinite(Date.parse(date)) && Date.parse(date) > Date.now());
/** The server's tenant-scoped entitlement decision is authoritative, including perpetual licences. */
export function appLicensed(app: ConnectorApp): boolean {
  return Boolean(app.Installed__c && (app.LicenceStatus__c === 'ACTIVE'
    || validUntil(app.LicenceExpiresAt__c)
    || (app.TrialUsed__c && validUntil(app.TrialExpiresAt__c))));
}
