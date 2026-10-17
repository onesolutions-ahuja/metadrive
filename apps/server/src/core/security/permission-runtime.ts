
import type { Principal } from '../../auth.js';
import { profileIdForRole } from '../../modules/security/role-helpers.js';

/** Canonical tenant-scoped RBAC evaluation. Cache lives only for this runtime. */
export function createCorePermissionRuntime(getState: () => PlatformState) {
const effectivePermissionCache = new WeakMap<TenantData, Map<string, {
  user: LocalUser; platformGrants?: PlatformState['platformPolicies'][string]; permissions: string[];
}>>();
function effectivePermissions(user: LocalUser, data: TenantData): string[] {
  const platformGrants = getState().platformPolicies[user.id];
  let tenantCache = effectivePermissionCache.get(data);
  if (!tenantCache) {
    tenantCache = new Map();
    effectivePermissionCache.set(data, tenantCache);
  }
  const cached = tenantCache.get(user.id);
  if (cached && cached.user === user && cached.platformGrants === platformGrants) {
    return cached.permissions;
  }
  const accessUser = data.accessControl.users.find((item) => item.id === user.id);
  const profile = data.accessControl.profiles.find((item) =>
    item.id === (accessUser?.profileId ?? profileIdForRole(user.role, data.accessControl.profiles)));
  // RBAC user assignments are authoritative; the login identity is only a
  // fallback for legacy tenant data that has not yet been reconciled.
  const assignedSetIds = accessUser?.permissionSetIds ?? user.permissionSetIds;
  const assignedGroupIds = accessUser?.permissionSetGroupIds ?? user.permissionSetGroupIds;
  const assigned = data.accessControl.permissionSets.filter((set) => assignedSetIds.includes(set.id));
  const permissions = new Set([...(profile?.systemPermissions ?? []), ...assigned.flatMap((set) => set.systemPermissions)]);
  for (const groupId of assignedGroupIds) {
    const group = data.accessControl.permissionSetGroups.find((item) => item.id === groupId);
    if (!group) continue;
    const groupPermissions = new Set(data.accessControl.permissionSets
      .filter((set) => group.permissionSetIds.includes(set.id))
      .flatMap((set) => set.systemPermissions));
    for (const permission of group.mutedSystemPermissions) groupPermissions.delete(permission);
    for (const permission of groupPermissions) permissions.add(permission);
  }
  // Neither a tenant administrator nor a tenant Flow can grant platform authority
  // through editable profile / permission-set metadata.
  for (const permission of permissions) {
    if (permission === 'licence:manage' || permission.startsWith('platform:')) permissions.delete(permission);
  }
  const policies = getState().platformPolicies[user.id] ?? [];
  if (policies.includes('platform:tenants:manage') || policies.includes('platform:superadmin')) {
    permissions.add('platform:tenants:manage');
    // Compatibility for older published platform-admin Page metadata.
    permissions.add('platform:superadmin');
    permissions.add('licence:manage');
  } else if (policies.includes('licence:manage')) {
    permissions.add('licence:manage');
  }
  const resolved = [...permissions];
  tenantCache.set(user.id, { user, platformGrants, permissions: resolved });
  return resolved;
}
function principalForUser(user: LocalUser, tenant: TenantData): Principal {
  return {
    userId: user.id,
    tenantId: user.tenantId,
    email: user.email,
    roles: [user.role],
    permissions: effectivePermissions(user, tenant)
  };
}

return { effectivePermissions, principalForUser };
}
