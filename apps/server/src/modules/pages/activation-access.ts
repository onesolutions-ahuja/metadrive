import { z } from 'zod';
import type { TenantData } from '../../core/state/types.js';
import { pageSchema } from './schemas.js';
import { resolvePageAssignment } from './page-assignment.js';
import { profileIdForRole } from '../security/role-helpers.js';

type LightningPage = z.infer<typeof pageSchema>;

export function resolveActiveLightningRecordPage(
  tenant: TenantData,
  objectApiName: string,
  appId: string,
  recordTypeId: string | undefined,
  profileId: string,
  formFactor: 'Desktop' | 'Phone'
): LightningPage | undefined {
  const match = resolvePageAssignment(tenant.pages, {
    pageType: 'Record Page', objectApiName, appId, recordTypeId, profileId, formFactor
  });
  if (match) return match;
  // Normal activation metadata is authoritative; no application-specific fallback.
  return undefined;
}

export function resolveActiveLightningHomePage(
  tenant: TenantData,
  appId: string,
  profileId: string,
  formFactor: 'Desktop' | 'Phone'
): LightningPage | undefined {
  return resolvePageAssignment(tenant.pages, {
    pageType: 'Home Page', appId, profileId, formFactor
  });
}

export function hasRecordTypeAccessForUser(userId: string, tenant: TenantData, objectName: string, recordTypeId: string): boolean {
  const user = tenant.accessControl.users.find((item) => item.id === userId);
  if (!user) return false;
  const key = `${objectName}.${recordTypeId}`;
  const profile = tenant.accessControl.profiles.find((item) =>
    item.id === (user.profileId ?? profileIdForRole(user.role, tenant.accessControl.profiles)));
  if (profile && profile.recordTypePermissions[key] !== false) return true;
  const sets = tenant.accessControl.permissionSets;
  if (sets.some((set) => user.permissionSetIds.includes(set.id) && set.recordTypePermissions[key] === true)) return true;
  return user.permissionSetGroupIds.some((groupId) => {
    const group = tenant.accessControl.permissionSetGroups.find((item) => item.id === groupId);
    return Boolean(group && group.mutedRecordTypePermissions[key] !== true
      && sets.some((set) => group.permissionSetIds.includes(set.id) && set.recordTypePermissions[key] === true));
  });
}

