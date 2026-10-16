import type { Principal } from '../../auth.js';
import type { TenantData, LocalUser } from '../../core/state/types.js';
import type { DashboardMetadata } from './schemas.js';
import { roleIdForName } from '../security/role-helpers.js';

export function createDashboardRunningUserHelpers(dependencies: {
  getUsers: () => LocalUser[];
  toPrincipal: (user: LocalUser, tenant: TenantData) => Principal;
  isRoleAtOrBelow: (targetRoleId: string, viewerRoleId: string, roles: TenantData['accessControl']['roles']) => boolean;
}) {
  const { getUsers, toPrincipal, isRoleAtOrBelow } = dependencies;
  function canSelectDashboardRunningUser(viewer: Principal, tenant: TenantData, targetUserId: string): boolean {
    if (targetUserId === viewer.userId
      || viewer.permissions.includes('dashboards:manage')) return true;
    if (viewer.permissions.includes('data:viewAll')) return true;
    if (!viewer.permissions.includes('dashboards:viewTeam')) return false;
    const viewerMetadata = tenant.accessControl.users.find((item) => item.id === viewer.userId);
    const targetMetadata = tenant.accessControl.users.find((item) => item.id === targetUserId);
    const viewerRoleId = viewerMetadata?.roleId ?? roleIdForName(viewerMetadata?.role ?? '', tenant.accessControl.roles);
    const targetRoleId = targetMetadata?.roleId ?? roleIdForName(targetMetadata?.role ?? '', tenant.accessControl.roles);
    return Boolean(viewerRoleId && targetRoleId
      && targetRoleId !== viewerRoleId
      && isRoleAtOrBelow(targetRoleId, viewerRoleId, tenant.accessControl.roles));
  }
  function dashboardRunningUserChoices(viewer: Principal, tenant: TenantData): string[] {
    return getUsers()
      .filter((user) => user.tenantId === viewer.tenantId && !user.disabled
        && canSelectDashboardRunningUser(viewer, tenant, user.id))
      .map((user) => user.id);
  }
  function dashboardRunningPrincipal(
    viewer: Principal,
    tenant: TenantData,
    dashboard: DashboardMetadata,
    selectedRunningUserId?: string
  ): Principal | undefined {
    if (dashboard.allowViewerToSelectRunningUser) {
      if (!selectedRunningUserId || selectedRunningUserId === viewer.userId) return viewer;
      if (!canSelectDashboardRunningUser(viewer, tenant, selectedRunningUserId)) return undefined;
      const selectedUser = getUsers().find((item) =>
        item.id === selectedRunningUserId && item.tenantId === viewer.tenantId && !item.disabled);
      return selectedUser ? toPrincipal(selectedUser, tenant) : undefined;
    }
    if (selectedRunningUserId && selectedRunningUserId !== dashboard.runningUserId) return undefined;
    if (!dashboard.runningUserId) return viewer;
    const user = getUsers().find((item) =>
      item.id === dashboard.runningUserId && item.tenantId === viewer.tenantId && !item.disabled);
    return user ? toPrincipal(user, tenant) : undefined;
  }
  function dashboardRunningUserSelectionError(
    viewer: Principal,
    tenant: TenantData,
    dashboard: DashboardMetadata,
    selectedRunningUserId?: string
  ): string | undefined {
    if (!selectedRunningUserId) return undefined;
    if (!dashboard.allowViewerToSelectRunningUser) {
      return selectedRunningUserId === dashboard.runningUserId
        ? undefined
        : 'This dashboard does not allow choosing a running user';
    }
    if (!canSelectDashboardRunningUser(viewer, tenant, selectedRunningUserId)) {
      return 'You do not have permission to choose this running user';
    }
    const selectedUser = getUsers().find((item) =>
      item.id === selectedRunningUserId && item.tenantId === viewer.tenantId && !item.disabled);
    if (!selectedUser) return 'The selected running user must be active and belong to this tenant';
    return undefined;
  }
  return { canSelectDashboardRunningUser, dashboardRunningUserChoices, dashboardRunningPrincipal, dashboardRunningUserSelectionError };
}
