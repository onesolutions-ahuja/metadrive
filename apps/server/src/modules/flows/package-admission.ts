/** Resolve independently installed app ownership from AppExchange metadata.
 * A Core Flow without package ownership stays independent of optional apps.
 * This does not replace request, step-level or record/field OneEngine checks.
 */
export type FlowPackage = {
  appKey: string;
  flows?: readonly { apiName: string }[];
  installation?: { allowInstalledMetadataWithoutLicence?: boolean };
};
export type FlowInstallation = {
  AppKey__c?: unknown;
  Installed__c?: unknown;
  LicenceStatus__c?: unknown;
};
export function flowPackageAdmission(
  flowApiName: string,
  packages: readonly FlowPackage[],
  installations: readonly FlowInstallation[]
): { installed: boolean; licensed: boolean; activated: boolean } {
  const owner = packages.find((pkg) => pkg.flows?.some((flow) => flow.apiName === flowApiName));
  if (!owner) return { installed: true, licensed: true, activated: true };
  const install = installations.find((row) => row.AppKey__c === owner.appKey);
  const installed = install?.Installed__c === true;
  const licensed = owner.installation?.allowInstalledMetadataWithoutLicence === true
    || (install?.LicenceStatus__c === 'Licensed' || install?.LicenceStatus__c === 'Trial');
  return { installed, licensed, activated: installed && licensed };
}
