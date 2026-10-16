import type { TenantData } from '../../core/state/types.js';
import type { DashboardFolder, DashboardMetadata } from '../../index.js';
import { dashboardFolderAccessLevel, type DashboardFolderAccessLevel } from '../../dashboard-access.js';

export function folderAccessLevelForUser(
  tenant: TenantData,
  folderId: string | null | undefined,
  userId: string
): DashboardFolderAccessLevel | null {
  return folderAccessLevelFromFolders(tenant, tenant.dashboardFolders ?? [], folderId, userId);
}

export function folderAccessLevelFromFolders(
  tenant: TenantData,
  folders: readonly DashboardFolder[],
  folderId: string | null | undefined,
  userId: string
): DashboardFolderAccessLevel | null {
  const accessUser = tenant.accessControl.users.find((user) => user.id === userId);
  const roleId = accessUser?.roleId
    ?? tenant.accessControl.roles.find((role) => role.name === accessUser?.role)?.id;
  return dashboardFolderAccessLevel(folderId, folders, {
    userId,
    roleId,
    permissionSetGroupIds: accessUser?.permissionSetGroupIds ?? [],
    roles: tenant.accessControl.roles,
    publicGroups: tenant.accessControl.publicGroups,
    territories: tenant.dashboardTerritories ?? []
  });
}

export function folderForUser(
  tenant: TenantData,
  folder: DashboardFolder,
  userId: string,
  canManageAll = false
): DashboardFolder & { accessLevel: DashboardFolderAccessLevel | null } {
  return {
    ...folder,
    accessLevel: canManageAll ? 'Manager' : folderAccessLevelForUser(tenant, folder.id, userId)
  };
}

export function dashboardForUser(
  tenant: TenantData,
  dashboard: DashboardMetadata,
  userId: string
): DashboardMetadata & { folderAccessLevel: DashboardFolderAccessLevel | null } {
  return {
    ...dashboard,
    folderAccessLevel: folderAccessLevelForUser(tenant, dashboard.folderId, userId)
  };
}

export function validateDashboardFolderReferences(
  tenant: TenantData,
  shares: DashboardFolder['shares']
): string | null {
  for (const share of shares) {
    const exists = share.targetType === 'User'
      ? tenant.accessControl.users.some((user) => user.id === share.targetId)
      : share.targetType === 'PublicGroup'
        ? tenant.accessControl.publicGroups.some((group) => group.id === share.targetId)
        : share.targetType === 'PermissionSetGroup'
          ? tenant.accessControl.permissionSetGroups.some((group) => group.id === share.targetId)
          : share.targetType === 'Territory'
            ? tenant.dashboardTerritories.some((territory) => territory.id === share.targetId)
            : tenant.accessControl.roles.some((role) => role.id === share.targetId);
    if (!exists) return `Folder share references unknown ${share.targetType} "${share.targetId}"`;
  }
  return null;
}
