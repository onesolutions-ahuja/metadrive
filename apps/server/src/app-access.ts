/**
 * Runtime app entitlement decision. The data comes from tenant state already
 * held by the API process; no SQL reads or external calls occur here.
 *
 * Access is checked on each protected route. Expiry is evaluated against the
 * current clock, so an expired licence cannot remain valid in a cache.
 */
export type AppAccess = {
  mode: 'AllTenantUsers' | 'Assigned';
  userIds: string[];
  profileIds: string[];
};
export type RuntimeApp = {
  apiName: string;
  access?: AppAccess;
  licenceAppKey?: string | null;
};
export type AppViewer = { userId: string; profileId: string };
export type AppLicenceRecord = {
  Id?: string;
  AppKey__c?: unknown;
  Installed__c?: unknown;
  TrialUsed__c?: unknown;
  TrialExpiresAt__c?: unknown;
  LicenceExpiresAt__c?: unknown;
};
export type AppAccessDecision = { allowed: boolean; reason: 'allowed' | 'not-assigned' | 'not-licensed' };

export function appAccessDecision(
  app: RuntimeApp,
  viewer: AppViewer,
  licences: readonly AppLicenceRecord[],
  now = Date.now()
): AppAccessDecision {
  const access = app.access;
  if (access?.mode === 'Assigned'
    && !access.userIds.includes(viewer.userId)
    && !access.profileIds.includes(viewer.profileId)) {
    return { allowed: false, reason: 'not-assigned' };
  }
  const key = app.licenceAppKey?.trim();
  if (!key) return { allowed: true, reason: 'allowed' };
  const licence = licences.find((item) => item.AppKey__c === key);
  if (!licence || licence.Installed__c !== true) {
    return { allowed: false, reason: 'not-licensed' };
  }
  const paidUntil = Date.parse(String(licence.LicenceExpiresAt__c ?? ''));
  const trialUntil = Date.parse(String(licence.TrialExpiresAt__c ?? ''));
  const activePaid = Number.isFinite(paidUntil) && now < paidUntil;
  const activeTrial = licence.TrialUsed__c === true
    && Number.isFinite(trialUntil) && now < trialUntil;
  return activePaid || activeTrial
    ? { allowed: true, reason: 'allowed' }
    : { allowed: false, reason: 'not-licensed' };
}
