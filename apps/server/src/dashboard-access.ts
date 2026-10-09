export type DashboardSharing = {
  ownerUserId: string;
  visibility: 'Private' | 'All Users';
  status: 'Draft' | 'Deployed';
  sharedUserIds: readonly string[];
  sharedPermissionSetGroupIds: readonly string[];
  folderAccessLevel?: DashboardFolderAccessLevel | null;
};

export type DashboardFolderAccessLevel = 'Viewer' | 'Editor' | 'Manager';
export type DashboardFolderShareTarget = 'User' | 'PublicGroup' | 'PermissionSetGroup' | 'Role' | 'RoleAndSubordinates' | 'Territory';

export type DashboardFolderShare = {
  targetType: DashboardFolderShareTarget;
  targetId: string;
  accessLevel: DashboardFolderAccessLevel;
};

export type DashboardFolder = {
  id: string;
  parentFolderId: string | null;
  ownerUserId: string;
  shares: readonly DashboardFolderShare[];
};

export type DashboardFolderAccessContext = {
  userId: string;
  roleId: string | undefined;
  permissionSetGroupIds?: readonly string[];
  roles: readonly { id: string; parentRoleId: string | null }[];
  territories?: readonly { id: string; parentTerritoryId: string | null; userIds: readonly string[] }[];
  publicGroups: readonly {
    id: string;
    userIds: readonly string[];
    roleIds: readonly string[];
    roleAndSubordinateIds: readonly string[];
    groupIds: readonly string[];
  }[];
};

const accessRank: Record<DashboardFolderAccessLevel, number> = {
  Viewer: 1,
  Editor: 2,
  Manager: 3
};

function userIsInPublicGroup(
  groupId: string,
  context: DashboardFolderAccessContext,
  visited = new Set<string>()
): boolean {
  if (visited.has(groupId)) return false;
  visited.add(groupId);
  const group = context.publicGroups.find((item) => item.id === groupId);
  if (!group) return false;
  if (group.userIds.includes(context.userId)) return true;
  if (context.roleId && group.roleIds.includes(context.roleId)) return true;
  if (context.roleId && group.roleAndSubordinateIds.some((roleId) =>
    roleIsAtOrBelow(context.roleId!, roleId, context.roles))) return true;
  return group.groupIds.some((nestedGroupId) =>
    userIsInPublicGroup(nestedGroupId, context, visited));
}

function userIsInTerritory(
  territoryId: string,
  context: DashboardFolderAccessContext
): boolean {
  const territories = context.territories ?? [];
  const descendants = new Set<string>([territoryId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const territory of territories) {
      if (territory.parentTerritoryId && descendants.has(territory.parentTerritoryId) && !descendants.has(territory.id)) {
        descendants.add(territory.id);
        changed = true;
      }
    }
  }
  return territories.some((territory) => descendants.has(territory.id) && territory.userIds.includes(context.userId));
}

function roleIsAtOrBelow(
  currentRoleId: string,
  targetRoleId: string,
  roles: DashboardFolderAccessContext['roles']
): boolean {
  let roleId: string | null | undefined = currentRoleId;
  const visited = new Set<string>();
  while (roleId && !visited.has(roleId)) {
    if (roleId === targetRoleId) return true;
    visited.add(roleId);
    roleId = roles.find((role) => role.id === roleId)?.parentRoleId;
  }
  return false;
}

export function dashboardFolderAccessLevel(
  folderId: string | null | undefined,
  folders: readonly DashboardFolder[],
  context: DashboardFolderAccessContext
): DashboardFolderAccessLevel | null {
  if (!folderId) return null;
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  let current = folderById.get(folderId);
  let highest: DashboardFolderAccessLevel | null = null;
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.ownerUserId === context.userId) return 'Manager';
    for (const share of current.shares) {
      const matches = share.targetType === 'User'
        ? share.targetId === context.userId
        : share.targetType === 'PublicGroup'
          ? userIsInPublicGroup(share.targetId, context)
          : share.targetType === 'PermissionSetGroup'
            ? Boolean(context.permissionSetGroupIds?.includes(share.targetId))
            : share.targetType === 'Territory'
              ? userIsInTerritory(share.targetId, context)
              : share.targetType === 'Role'
                ? context.roleId === share.targetId
                : Boolean(context.roleId && roleIsAtOrBelow(context.roleId, share.targetId, context.roles));
      if (matches && (!highest || accessRank[share.accessLevel] > accessRank[highest])) {
        highest = share.accessLevel;
      }
    }
    current = current.parentFolderId ? folderById.get(current.parentFolderId) : undefined;
  }
  return highest;
}

export function canAccessDashboard(
  dashboard: DashboardSharing,
  userId: string,
  permissionSetGroupIds: readonly string[],
  canManageAll: boolean
): boolean {
  if (dashboard.ownerUserId === userId || canManageAll) return true;
  if (dashboard.folderAccessLevel) return true;
  if (dashboard.status !== 'Deployed') return false;
  return dashboard.visibility === 'All Users'
    || dashboard.sharedUserIds.includes(userId)
    || dashboard.sharedPermissionSetGroupIds.some((groupId) => permissionSetGroupIds.includes(groupId));
}

export function canEditDashboard(
  dashboard: DashboardSharing,
  userId: string,
  canManageAll: boolean
): boolean {
  if (dashboard.ownerUserId === userId || canManageAll) return true;
  return dashboard.folderAccessLevel === 'Editor' || dashboard.folderAccessLevel === 'Manager';
}

export function matchesDashboardFilters<T>(
  filters: readonly T[],
  logic: 'All' | 'Any',
  matches: (filter: T) => boolean
): boolean {
  return filters.length === 0 || (logic === 'Any' ? filters.some(matches) : filters.every(matches));
}
