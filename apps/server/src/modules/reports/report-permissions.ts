import type { Principal } from '../../auth.js';

export const canManageReportFolders = (principal: Principal): boolean =>
  principal.permissions.includes('metadata:write') || principal.permissions.includes('reports:manage');
