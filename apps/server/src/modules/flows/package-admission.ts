/** Resolve independently installed app ownership from AppExchange metadata.
 * A Core Flow without package ownership stays independent of optional apps.
 * This does not replace request, step-level or record/field OneEngine checks.
 */
export type FlowPackage = {
  appKey: string;
  flows?: readonly { apiName: string }[];
  installation?: { allowInstalledMetadataWithoutLicence?: boolean };
};
export type FlowInstallation = Record<string, unknown>;
export function flowPackageAdmission(
  flowApiName: string,
  packages: readonly FlowPackage[],
  installations: readonly FlowInstallation[],
  now = new Date()
): { installed: boolean; licensed: boolean; activated: boolean } {
  const owner = packages.find((pkg) => pkg.flows?.some((flow) => flow.apiName === flowApiName));
  if (!owner) return { installed: true, licensed: true, activated: true };
  const install = installations.find((row) => row.AppKey__c === owner.appKey);
  const installed = install?.Installed__c === true;
  const activePaid = typeof install?.LicenceExpiresAt__c === 'string'
    && Date.parse(install.LicenceExpiresAt__c) > now.getTime();
  const activeTrial = install?.TrialUsed__c === true
    && typeof install?.TrialExpiresAt__c === 'string'
    && Date.parse(install.TrialExpiresAt__c) > now.getTime();
  const licensed = owner.installation?.allowInstalledMetadataWithoutLicence === true
    || activePaid || activeTrial;
  return { installed, licensed, activated: installed && licensed };
}
