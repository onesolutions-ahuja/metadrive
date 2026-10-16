import type { TenantData } from '../../core/state/types.js';
import type { ReportFolder } from '../../index.js';
import type { Principal } from '../../auth.js';

type AccessLevel = 'Viewer' | 'Editor' | 'Manager';
export const canManageReportFolders = (principal: Principal): boolean =>
  principal.permissions.includes('metadata:write') || principal.permissions.includes('reports:manage');

export function createReportFolderPermissions(deps: {
  folderAccessLevelFromFolders: (tenant: TenantData, folders: readonly ReportFolder[], folderId: string | null | undefined, userId: string) => AccessLevel | null;
  validateDashboardFolderReferences: (tenant: TenantData, shares: ReportFolder['shares']) => string | null;
}) {
 const { folderAccessLevelFromFolders, validateDashboardFolderReferences } = deps;
function reportFolderAccessLevelForUser(
  tenant: TenantData,
  folderId: string | null | undefined,
  userId: string
): AccessLevel | null {
  const folder = tenant.reportFolders.find((item) => item.id === folderId);
  if (!folder) return null;
  const inheritedPublic = (() => {
    let current: ReportFolder | undefined = folder;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      if (current.visibility === 'All Users') return true;
      visited.add(current.id);
      current = current.parentFolderId
        ? tenant.reportFolders.find((item) => item.id === current!.parentFolderId)
        : undefined;
    }
    return false;
  })();
  const shared = folderAccessLevelFromFolders(tenant, tenant.reportFolders, folderId, userId);
  return inheritedPublic && (!shared || shared === 'Viewer') ? 'Viewer' : shared;
}
function reportFolderForUser(
  tenant: TenantData,
  folder: ReportFolder,
  userId: string,
  canManageAll: boolean
): ReportFolder & { accessLevel: AccessLevel | null } {
  return {
    ...folder,
    accessLevel: canManageAll
      ? 'Manager'
      : reportFolderAccessLevelForUser(tenant, folder.id, userId)
  };
}
function validateReportFolderReferences(
  tenant: TenantData,
  shares: ReportFolder['shares']
): string | null {
  return validateDashboardFolderReferences(tenant, shares);
}
return { reportFolderAccessLevelForUser, reportFolderForUser, validateReportFolderReferences };
}
