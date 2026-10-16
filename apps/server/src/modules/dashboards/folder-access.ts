import type { TenantData } from '../../core/state/types.js';
import type { DashboardFolder, DashboardMetadata } from '../../index.js';
import { dashboardFolderAccessLevel, type DashboardFolderAccessLevel } from '../../dashboard-access.js';

export function folderAccessLevelForUser(
  tenant: TenantData,
  folderId: string | null | undefined,
  userId: string

export function folderAccessLevelFromFolders(
  tenant: TenantData,
  folders: readonly DashboardFolder[],
  folderId: string | null | undefined,
  userId: string

export function folderForUser(
  tenant: TenantData,
  folder: DashboardFolder,
  userId: string,
  canManageAll = false

export function dashboardForUser(
  tenant: TenantData,
  dashboard: DashboardMetadata,
  userId: string

export function validateDashboardFolderReferences(
  tenant: TenantData,
  shares: DashboardFolder['shares']
