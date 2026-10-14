import type { TenantData } from '../../index.js';
export function removeObjectMetadata(tenant: TenantData, apiName: string): TenantData {
  const updatedTenant: TenantData = {
    ...tenant,
    objects: tenant.objects.filter((item) => item.apiName !== apiName),
    records: Object.fromEntries(Object.entries(tenant.records).filter(([name]) => name !== apiName)),
    fieldHistory: tenant.fieldHistory.filter((entry) => entry.objectApiName !== apiName),
    activities: tenant.activities.filter((activity) => activity.objectApiName !== apiName),
    chatterPosts: tenant.chatterPosts.filter((post) => post.objectApiName !== apiName),
    approvalRequests: tenant.approvalRequests.filter((request) => request.objectApiName !== apiName),
    sharingSettings: Object.fromEntries(Object.entries(tenant.sharingSettings).filter(([name]) => name !== apiName)),
    recordShares: tenant.recordShares.filter((share) => share.objectApiName !== apiName),
    accessControl: {
      ...tenant.accessControl,
      profiles: tenant.accessControl.profiles.map((profile) => ({
        ...profile,
        objectPermissions: Object.fromEntries(Object.entries(profile.objectPermissions).filter(([name]) => name !== apiName)),
        fieldPermissions: Object.fromEntries(Object.entries(profile.fieldPermissions).filter(([name]) => !name.startsWith(`${apiName}.`)))
      })),
      permissionSets: tenant.accessControl.permissionSets.map((permissionSet) => {
        return {
          ...permissionSet,
          objectPermissions: Object.fromEntries(Object.entries(permissionSet.objectPermissions).filter(([name]) => name !== apiName)),
          fieldPermissions: Object.fromEntries(Object.entries(permissionSet.fieldPermissions).filter(([name]) => !name.startsWith(`${apiName}.`)))
        };
      }),
      permissionSetGroups: tenant.accessControl.permissionSetGroups.map((group) => ({
        ...group,
        mutedObjectPermissions: Object.fromEntries(Object.entries(group.mutedObjectPermissions).filter(([name]) => name !== apiName)),
        mutedFieldPermissions: Object.fromEntries(Object.entries(group.mutedFieldPermissions).filter(([name]) => !name.startsWith(`${apiName}.`)))
      }))
    }
  };
  return updatedTenant;
}
