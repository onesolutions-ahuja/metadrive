import type { Request, Response } from 'express';
import { z } from 'zod';
import type { PlatformState, DashboardFolder, DashboardFilterMetadata, DashboardSnapshot, RuntimeRecord } from '../../index.js';

type Runtime = typeof import('../../index.js');
type Dependencies = Pick<Runtime, 'app' | 'dashboardFolderShareSchema' | 'dashboardFolderSchema' | 'dashboardTerritorySchema' | 'dashboardSchema' | 'dashboardTimeZoneSchema' | 'dashboardSubscriptionSchema' | 'isNumericField' | 'dashboardFilterOperatorAllowed' | 'dashboardFilterValueError' | 'sanitizeDashboardRichText' | 'persistState' | 'tenantData' | 'getPrincipal' | 'principalUser' | 'effectivePermissions' | 'dashboardRunningUserChoices' | 'dashboardRunningPrincipal' | 'dashboardRunningUserSelectionError' | 'folderAccessLevelForUser' | 'folderForUser' | 'dashboardForUser' | 'validateDashboardFolderReferences' | 'requirePermission' | 'requireAnyPermission' | 'hasObjectPermission' | 'hasRecordAccess' | 'sanitizeRecordForRead' | 'persistTenantRecords' | 'routeParam' | 'formulaContextForUser' | 'dashboardRelationshipPaths' | 'dispatchDashboardSubscription' | 'nextDashboardSubscriptionRunAt' | 'calculateFormulaFields' | 'libraryComponentVisible' | 'randomUUID' | 'canAccessDashboard' | 'canEditDashboard'> & {
  getState: () => PlatformState;
  setState: (next: PlatformState) => void;
};
export function registerDashboardRoutes(deps: Dependencies): void {
  const { app, dashboardFolderShareSchema, dashboardFolderSchema, dashboardTerritorySchema, dashboardSchema, dashboardTimeZoneSchema, dashboardSubscriptionSchema, isNumericField, dashboardFilterOperatorAllowed, dashboardFilterValueError, sanitizeDashboardRichText, persistState, tenantData, getPrincipal, principalUser, effectivePermissions, dashboardRunningUserChoices, dashboardRunningPrincipal, dashboardRunningUserSelectionError, folderAccessLevelForUser, folderForUser, dashboardForUser, validateDashboardFolderReferences, requirePermission, requireAnyPermission, hasObjectPermission, hasRecordAccess, sanitizeRecordForRead, persistTenantRecords, routeParam, formulaContextForUser, dashboardRelationshipPaths, dispatchDashboardSubscription, nextDashboardSubscriptionRunAt, calculateFormulaFields, libraryComponentVisible, randomUUID, canAccessDashboard, canEditDashboard, getState, setState } = deps;
const dashboardFolderInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  parentFolderId: z.string().uuid().nullable(),
  shares: z.array(dashboardFolderShareSchema).default([])
});
app.get('/api/metadata/dashboard-folders', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const canManageAll = principal.permissions.includes('dashboards:manage');
  return res.json({
    folders: (tenant.dashboardFolders ?? [])
      .filter((folder) => canManageAll || folderAccessLevelForUser(tenant, folder.id, principal.userId) !== null)
      .map((folder) => folderForUser(tenant, folder, principal.userId, canManageAll)),
    canManageAll
  });
});
app.post('/api/metadata/dashboard-folders', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const parsed = dashboardFolderInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid dashboard folder', details: parsed.error.flatten() });
  if (parsed.data.parentFolderId) {
    const parent = tenant.dashboardFolders.find((folder) => folder.id === parsed.data.parentFolderId);
    if (!parent) return res.status(400).json({ error: 'Parent dashboard folder was not found' });
    const parentLevel = folderAccessLevelForUser(tenant, parent.id, principal.userId);
    if (!principal.permissions.includes('dashboards:manage') && parentLevel !== 'Manager') {
      return res.status(403).json({ error: 'Manager access to the parent folder is required to create a subfolder' });
    }
  } else if (!principal.permissions.includes('metadata:write') && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Metadata write access or dashboard administration is required to create a top-level folder' });
  }
  const duplicate = tenant.dashboardFolders.some((folder) =>
    folder.parentFolderId === parsed.data.parentFolderId && folder.label.toLocaleLowerCase() === parsed.data.label.toLocaleLowerCase());
  if (duplicate) return res.status(409).json({ error: 'A folder with this name already exists at that level' });
  const shareError = validateDashboardFolderReferences(tenant, parsed.data.shares);
  if (shareError) return res.status(400).json({ error: shareError });
  const now = new Date().toISOString();
  const folder = dashboardFolderSchema.parse({
    ...parsed.data,
    id: randomUUID(),
    ownerUserId: principal.userId,
    createdAt: now,
    updatedAt: now
  });
  const updatedTenant = { ...tenant, dashboardFolders: [...tenant.dashboardFolders, folder] };
  persistTenantRecords(principal.tenantId, updatedTenant);
  return res.status(201).json({ folder: folderForUser(updatedTenant, folder, principal.userId, principal.permissions.includes('dashboards:manage')) });
});
app.put('/api/metadata/dashboard-folders/:folderId', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const folderId = routeParam(req, 'folderId');
  const current = tenant.dashboardFolders.find((folder) => folder.id === folderId);
  if (!current) return res.status(404).json({ error: 'Dashboard folder was not found' });
  if (current.ownerUserId !== principal.userId
    && folderAccessLevelForUser(tenant, folderId, principal.userId) !== 'Manager'
    && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Manager access to this folder is required to update it or its grants' });
  }
  const parsed = dashboardFolderInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid dashboard folder', details: parsed.error.flatten() });
  if (parsed.data.parentFolderId === folderId) return res.status(400).json({ error: 'A folder cannot be its own parent' });
  if (parsed.data.parentFolderId) {
    const parent = tenant.dashboardFolders.find((folder) => folder.id === parsed.data.parentFolderId);
    if (!parent) return res.status(400).json({ error: 'Parent dashboard folder was not found' });
    if (folderAccessLevelForUser(tenant, parent.id, principal.userId) !== 'Manager'
      && !principal.permissions.includes('dashboards:manage')) {
      return res.status(403).json({ error: 'Manager access to the destination folder is required' });
    }
    let ancestor: DashboardFolder | undefined = parent;
    const visited = new Set<string>();
    while (ancestor && !visited.has(ancestor.id)) {
      if (ancestor.id === folderId) return res.status(400).json({ error: 'A folder cannot be moved beneath one of its descendants' });
      visited.add(ancestor.id);
      ancestor = ancestor.parentFolderId
        ? tenant.dashboardFolders.find((folder) => folder.id === ancestor!.parentFolderId)
        : undefined;
    }
  }
  const duplicate = tenant.dashboardFolders.some((folder) =>
    folder.id !== folderId && folder.parentFolderId === parsed.data.parentFolderId
    && folder.label.toLocaleLowerCase() === parsed.data.label.toLocaleLowerCase());
  if (duplicate) return res.status(409).json({ error: 'A folder with this name already exists at that level' });
  const shareError = validateDashboardFolderReferences(tenant, parsed.data.shares);
  if (shareError) return res.status(400).json({ error: shareError });
  const folder = dashboardFolderSchema.parse({ ...current, ...parsed.data, updatedAt: new Date().toISOString() });
  const updatedTenant = {
    ...tenant,
    dashboardFolders: tenant.dashboardFolders.map((item) => item.id === folderId ? folder : item)
  };
  persistTenantRecords(principal.tenantId, updatedTenant);
  return res.json({ folder: folderForUser(updatedTenant, folder, principal.userId, principal.permissions.includes('dashboards:manage')) });
});
app.delete('/api/metadata/dashboard-folders/:folderId', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const folderId = routeParam(req, 'folderId');
  const folder = tenant.dashboardFolders.find((item) => item.id === folderId);
  if (!folder) return res.status(404).json({ error: 'Dashboard folder was not found' });
  if (folder.ownerUserId !== principal.userId
    && folderAccessLevelForUser(tenant, folderId, principal.userId) !== 'Manager'
    && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Manager access to this folder is required to delete it' });
  }
  if (tenant.dashboardFolders.some((item) => item.parentFolderId === folderId)
    || tenant.dashboards.some((dashboard) => dashboard.folderId === folderId)) {
    return res.status(409).json({ error: 'Move dashboards and subfolders before deleting this folder' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    dashboardFolders: tenant.dashboardFolders.filter((item) => item.id !== folderId)
  });
  return res.status(204).end();
});

const dashboardTerritoryInputSchema = z.array(z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(80),
  parentTerritoryId: z.string().uuid().nullable(),
  userIds: z.array(z.string().min(1))
}));
app.get('/api/metadata/dashboard-territories', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const user = principalUser(principal);
  if (!user) return res.status(403).json({ error: 'Tenant membership is no longer active' });
  const permissions = effectivePermissions(user, tenant);
  return res.json({
    territories: tenant.dashboardTerritories ?? [],
    canManage: permissions.includes('dashboards:manage') || permissions.includes('metadata:write')
  });
});
app.put('/api/metadata/dashboard-territories', requireAnyPermission('dashboards:manage', 'metadata:write'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const parsed = dashboardTerritoryInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid dashboard territories', details: parsed.error.flatten() });
  const ids = new Set(parsed.data.map((territory) => territory.id));
  if (ids.size !== parsed.data.length) return res.status(400).json({ error: 'Territory IDs must be unique' });
  const userIds = new Set(tenant.accessControl.users.map((user) => user.id));
  for (const territory of parsed.data) {
    if (territory.parentTerritoryId && !ids.has(territory.parentTerritoryId)) {
      return res.status(400).json({ error: `Territory "${territory.label}" references an unknown parent` });
    }
    if (territory.userIds.some((userId) => !userIds.has(userId))) {
      return res.status(400).json({ error: `Territory "${territory.label}" references an unknown tenant user` });
    }
    const visited = new Set<string>([territory.id]);
    let parentId = territory.parentTerritoryId;
    while (parentId) {
      if (visited.has(parentId)) return res.status(400).json({ error: 'Territory hierarchy cannot contain cycles' });
      visited.add(parentId);
      parentId = parsed.data.find((candidate) => candidate.id === parentId)?.parentTerritoryId ?? null;
    }
  }
  const retainedIds = new Set(parsed.data.map((territory) => territory.id));
  const removedGrant = tenant.dashboardFolders.some((folder) =>
    folder.shares.some((share) => share.targetType === 'Territory' && !retainedIds.has(share.targetId)));
  if (removedGrant) return res.status(409).json({ error: 'Remove folder grants before deleting their territories' });
  const now = new Date().toISOString();
  const existingById = new Map((tenant.dashboardTerritories ?? []).map((territory) => [territory.id, territory]));
  const dashboardTerritories = parsed.data.map((territory) => {
    const existing = existingById.get(territory.id);
    return dashboardTerritorySchema.parse({
      ...territory,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    });
  });
  persistTenantRecords(principal.tenantId, { ...tenant, dashboardTerritories });
  return res.json({ territories: dashboardTerritories });
});

app.get('/api/metadata/dashboards', requirePermission('metadata:read'), (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId);
  const dashboards = tenant?.dashboards ?? [];
  const canManageAll = principal.permissions.includes('dashboards:manage');
  const accessUser = tenant?.accessControl.users.find((user) => user.id === principal.userId);
  return res.json({
    dashboards: dashboards.filter((dashboard) => canAccessDashboard(
      dashboardForUser(tenant!, dashboard, principal.userId),
      principal.userId,
      accessUser?.permissionSetGroupIds ?? [],
      canManageAll
    )).map((dashboard) => dashboardForUser(tenant!, dashboard, principal.userId)),
    userId: principal.userId,
    runningUserIds: dashboardRunningUserChoices(principal, tenant!),
    canCreate: principal.permissions.includes('metadata:write') || canManageAll,
    canManageAll,
    canSchedule: principal.permissions.includes('email:send')
  });
});
app.get('/api/metadata/dashboards/:apiName/data/:objectName', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const viewer = getPrincipal(res);
  const tenant = tenantData(viewer.tenantId)!;
  const dashboard = tenant.dashboards.find((item) => item.apiName === routeParam(req, 'apiName'));
  if (!dashboard) return res.status(404).json({ error: 'Dashboard was not found' });
  const viewerAccess = tenant.accessControl.users.find((user) => user.id === viewer.userId);
  if (!canAccessDashboard(dashboardForUser(tenant, dashboard, viewer.userId), viewer.userId, viewerAccess?.permissionSetGroupIds ?? [], viewer.permissions.includes('dashboards:manage'))) {
    return res.status(404).json({ error: 'Dashboard was not found' });
  }
  const objectApiName = routeParam(req, 'objectName');
  const referencedObjects = new Set([
    ...dashboard.components.map((component) => component.objectApiName),
    ...dashboard.filters.map((filter) => filter.objectApiName)
  ]);
  const sourceObjects = [...new Set(dashboard.components.map((component) => component.objectApiName))];
  const targets = [...new Set([...sourceObjects, ...dashboard.filters.map((filter) => filter.objectApiName)])];
  sourceObjects.forEach((source) => targets.forEach((target) => {
    dashboardRelationshipPaths(tenant, source, target).forEach((path) => path.forEach((step) => {
      referencedObjects.add(step.sourceObjectApiName);
      referencedObjects.add(step.targetObjectApiName);
    }));
  }));
  if (!referencedObjects.has(objectApiName)) return res.status(404).json({ error: 'Dashboard data object was not found' });
  const requestedRunningUserId = typeof req.query.runningUserId === 'string' ? req.query.runningUserId : undefined;
  if (req.query.runningUserId !== undefined && requestedRunningUserId === undefined) {
    return res.status(400).json({ error: 'runningUserId must be a single user ID' });
  }
  if (requestedRunningUserId !== undefined && !requestedRunningUserId.trim()) {
    return res.status(400).json({ error: 'runningUserId cannot be empty' });
  }
  const runningUserError = dashboardRunningUserSelectionError(viewer, tenant, dashboard, requestedRunningUserId);
  if (runningUserError) return res.status(403).json({ error: runningUserError });
  const executionPrincipal = dashboardRunningPrincipal(viewer, tenant, dashboard, requestedRunningUserId);
  if (!executionPrincipal) return res.status(409).json({ error: 'The dashboard running user is no longer active' });
  const object = tenant.objects.find((item) => item.apiName === objectApiName);
  if (!object) return res.status(404).json({ error: `Object "${objectApiName}" was not found` });
  if (!hasObjectPermission(executionPrincipal, tenant, objectApiName, 'read')) {
    return res.status(403).json({ error: `The dashboard running user cannot read object "${objectApiName}"` });
  }
  if (objectApiName === 'User') {
    const formulaContext = formulaContextForUser(tenant, executionPrincipal.userId);
    const records = getState().users.filter((user) => user.tenantId === viewer.tenantId && !user.disabled).map((user) => {
      const record = calculateFormulaFields(object, {
        Id: user.id, Name: user.name, Email: user.email, Username: user.email, IsActive: true,
        UserRoleId: user.role, CreatedDate: user.createdAt, LastModifiedDate: user.createdAt
      }, formulaContext);
      return sanitizeRecordForRead(executionPrincipal, tenant, object, record);
    });
    return res.json({ records });
  }
  const formulaContext = formulaContextForUser(tenant, executionPrincipal.userId);
  return res.json({
    records: (tenant.records[objectApiName] ?? [])
      .filter((record) => hasRecordAccess(executionPrincipal, tenant, objectApiName, record, 'Read'))
      .map((record) => sanitizeRecordForRead(executionPrincipal, tenant, object,
        calculateFormulaFields(object, record, formulaContext)))
  });
});
const dashboardSubscriptionInputSchema = z.object({
  label: z.string().trim().min(1).max(80),
  frequency: z.enum(['Daily', 'Weekly']),
  localTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  timeZone: dashboardTimeZoneSchema,
  dayOfWeek: z.number().int().min(0).max(6).nullable(),
  recipientUserIds: z.array(z.string().min(1)).min(1).max(20),
  namedCredentialId: z.string().uuid(),
  fromEmail: z.string().email().max(254),
  active: z.boolean().default(true),
  saveSnapshots: z.boolean().default(true)
}).superRefine((subscription, context) => {
  if ((subscription.frequency === 'Weekly') !== (subscription.dayOfWeek !== null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['dayOfWeek'], message: 'Weekly schedules require a weekday only' });
  }
  if (new Set(subscription.recipientUserIds).size !== subscription.recipientUserIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['recipientUserIds'], message: 'Recipient users must be unique' });
  }
});
app.get('/api/metadata/dashboards/:apiName/subscriptions', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const dashboard = tenant.dashboards.find((item) => item.apiName === routeParam(req, 'apiName'));
  if (!dashboard) return res.status(404).json({ error: 'Dashboard was not found' });
  const accessUser = tenant.accessControl.users.find((user) => user.id === principal.userId);
  if (!canAccessDashboard(dashboardForUser(tenant, dashboard, principal.userId), principal.userId, accessUser?.permissionSetGroupIds ?? [], principal.permissions.includes('dashboards:manage'))) {
    return res.status(404).json({ error: 'Dashboard was not found' });
  }
  return res.json({
    subscriptions: tenant.dashboardSubscriptions.filter((item) =>
      item.dashboardApiName === dashboard.apiName
      && (item.createdBy === principal.userId || principal.permissions.includes('dashboards:manage')))
  });
});
app.post('/api/metadata/dashboards/:apiName/subscriptions', requireAnyPermission('metadata:write', 'dashboards:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const dashboard = tenant.dashboards.find((item) => item.apiName === routeParam(req, 'apiName'));
  if (!dashboard) return res.status(404).json({ error: 'Dashboard was not found' });
  if (dashboard.ownerUserId !== principal.userId && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Only the dashboard owner or a dashboard administrator can manage subscriptions' });
  }
  if (!principal.permissions.includes('email:send')) return res.status(403).json({ error: 'The email:send permission is required' });
  if (dashboard.status !== 'Deployed') return res.status(409).json({ error: 'Publish the dashboard before scheduling a subscription' });
  const input = dashboardSubscriptionInputSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid dashboard subscription', details: input.error.flatten() });
  if (!tenant.namedCredentials.some((item) => item.id === input.data.namedCredentialId && item.protocol === 'SMTP')) {
    return res.status(400).json({ error: 'Select an available SMTP Named Credential' });
  }
  for (const userId of input.data.recipientUserIds) {
    const user = getState().users.find((item) => item.id === userId && item.tenantId === principal.tenantId && !item.disabled);
    const access = tenant.accessControl.users.find((item) => item.id === userId);
    if (!user || !access || !canAccessDashboard(dashboardForUser(tenant, dashboard, userId), userId, access.permissionSetGroupIds, false)) {
      return res.status(400).json({ error: 'Every recipient must be an active tenant user with access to this dashboard' });
    }
  }
  const now = new Date().toISOString();
  const subscription = dashboardSubscriptionSchema.parse({
    ...input.data,
    id: randomUUID(),
    dashboardApiName: dashboard.apiName,
    nextRunAt: nextDashboardSubscriptionRunAt(input.data, new Date()),
    lastRunAt: null,
    lastRunStatus: 'Never',
    lastRunError: null,
    createdBy: principal.userId,
    createdAt: now,
    updatedAt: now
  });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    dashboardSubscriptions: [...tenant.dashboardSubscriptions, subscription]
  });
  return res.status(201).json({ subscription });
});
app.put('/api/metadata/dashboards/:apiName/subscriptions/:subscriptionId', requireAnyPermission('metadata:write', 'dashboards:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const subscriptionId = routeParam(req, 'subscriptionId');
  const current = tenant.dashboardSubscriptions.find((item) => item.id === subscriptionId && item.dashboardApiName === apiName);
  if (!current) return res.status(404).json({ error: 'Dashboard subscription was not found' });
  if (current.createdBy !== principal.userId && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Only the subscription owner or a dashboard administrator can update it' });
  }
  if (!principal.permissions.includes('email:send')) return res.status(403).json({ error: 'The email:send permission is required' });
  const dashboard = tenant.dashboards.find((item) => item.apiName === apiName);
  if (!dashboard || dashboard.status !== 'Deployed') return res.status(409).json({ error: 'Publish the dashboard before updating a subscription' });
  const input = dashboardSubscriptionInputSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid dashboard subscription', details: input.error.flatten() });
  if (!tenant.namedCredentials.some((item) => item.id === input.data.namedCredentialId && item.protocol === 'SMTP')) {
    return res.status(400).json({ error: 'Select an available SMTP Named Credential' });
  }
  for (const userId of input.data.recipientUserIds) {
    const user = getState().users.find((item) => item.id === userId && item.tenantId === principal.tenantId && !item.disabled);
    const access = tenant.accessControl.users.find((item) => item.id === userId);
    if (!user || !access || !canAccessDashboard(dashboardForUser(tenant, dashboard, userId), userId, access.permissionSetGroupIds, false)) {
      return res.status(400).json({ error: 'Every recipient must be an active tenant user with access to this dashboard' });
    }
  }
  const updated = dashboardSubscriptionSchema.parse({
    ...current, ...input.data,
    nextRunAt: nextDashboardSubscriptionRunAt(input.data, new Date()),
    lastRunAt: current.lastRunAt, lastRunStatus: current.lastRunStatus, lastRunError: current.lastRunError,
    updatedAt: new Date().toISOString()
  });
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    dashboardSubscriptions: tenant.dashboardSubscriptions.map((item) => item.id === subscriptionId ? updated : item)
  });
  return res.json({ subscription: updated });
});
app.delete('/api/metadata/dashboards/:apiName/subscriptions/:subscriptionId', requireAnyPermission('metadata:write', 'dashboards:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const subscriptionId = routeParam(req, 'subscriptionId');
  const current = tenant.dashboardSubscriptions.find((item) => item.id === subscriptionId && item.dashboardApiName === apiName);
  if (!current) return res.status(404).json({ error: 'Dashboard subscription was not found' });
  if (current.createdBy !== principal.userId && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Only the subscription owner or a dashboard administrator can delete it' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    dashboardSubscriptions: tenant.dashboardSubscriptions.filter((item) => item.id !== subscriptionId)
  });
  return res.status(204).end();
});
app.post('/api/metadata/dashboards/:apiName/subscriptions/:subscriptionId/run', requireAnyPermission('metadata:write', 'dashboards:manage'), async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const subscription = tenant.dashboardSubscriptions.find((item) =>
    item.id === routeParam(req, 'subscriptionId') && item.dashboardApiName === routeParam(req, 'apiName'));
  if (!subscription) return res.status(404).json({ error: 'Dashboard subscription was not found' });
  if (subscription.createdBy !== principal.userId && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Only the subscription owner or a dashboard administrator can run it' });
  }
  if (!principal.permissions.includes('email:send')) return res.status(403).json({ error: 'The email:send permission is required' });
  await dispatchDashboardSubscription(principal.tenantId, subscription.id, true);
  const updated = tenantData(principal.tenantId)!.dashboardSubscriptions.find((item) => item.id === subscription.id);
  if (updated?.lastRunStatus === 'Failed') {
    return res.status(502).json({ error: updated.lastRunError ?? 'Dashboard subscription delivery failed', subscription: updated });
  }
  return res.json({ subscription: updated });
});
app.put('/api/metadata/dashboards/:apiName', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const existing = tenant.dashboards.find((dashboard) => dashboard.apiName === apiName);
  if (existing && !canEditDashboard(
    dashboardForUser(tenant, existing, principal.userId),
    principal.userId,
    principal.permissions.includes('dashboards:manage')
  )) {
    return res.status(403).json({ error: 'Dashboard editor access is required to change its metadata' });
  }
  if (!existing && !principal.permissions.includes('metadata:write') && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Metadata write access is required to create a dashboard' });
  }
  const parsed = dashboardSchema.safeParse({
    ...req.body,
    apiName,
    ownerUserId: existing?.ownerUserId ?? principal.userId
  });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid dashboard metadata', details: parsed.error.flatten() });
  const ownsDashboard = existing?.ownerUserId === principal.userId
    || principal.permissions.includes('dashboards:manage');
  if (existing && !ownsDashboard && (
    parsed.data.visibility !== existing.visibility
    || [...parsed.data.sharedUserIds].sort().join('\0') !== [...existing.sharedUserIds].sort().join('\0')
    || [...parsed.data.sharedPermissionSetGroupIds].sort().join('\0') !== [...existing.sharedPermissionSetGroupIds].sort().join('\0')
  )) {
    return res.status(403).json({ error: 'Only the dashboard owner or an administrator can change dashboard-level sharing' });
  }
  if (parsed.data.runningUserId !== (existing?.runningUserId ?? null) && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Only a dashboard administrator can change the dashboard running user' });
  }
  if (parsed.data.allowViewerToSelectRunningUser !== (existing?.allowViewerToSelectRunningUser ?? false)
    && !principal.permissions.includes('dashboards:manage')) {
    return res.status(403).json({ error: 'Only a dashboard administrator can configure running-user selection' });
  }
  if (parsed.data.runningUserId && !getState().users.some((user) =>
    user.id === parsed.data.runningUserId && user.tenantId === principal.tenantId && !user.disabled)) {
    return res.status(400).json({ error: 'The selected dashboard running user must be an active user in this tenant' });
  }
  if (parsed.data.folderId) {
    const folder = tenant.dashboardFolders.find((item) => item.id === parsed.data.folderId);
    if (!folder) return res.status(400).json({ error: 'Select an existing dashboard folder' });
    const folderLevel = folderAccessLevelForUser(tenant, folder.id, principal.userId);
    const isMoving = existing?.folderId !== parsed.data.folderId;
    if ((isMoving || !ownsDashboard)
      && folderLevel !== 'Editor' && folderLevel !== 'Manager'
      && !principal.permissions.includes('dashboards:manage')) {
      return res.status(403).json({ error: 'Editor access to the destination dashboard folder is required' });
    }
    if (isMoving && existing?.folderId
      && folderAccessLevelForUser(tenant, existing.folderId, principal.userId) !== 'Manager'
      && !principal.permissions.includes('dashboards:manage')) {
      return res.status(403).json({ error: 'Manager access to the current folder is required to move this dashboard' });
    }
    let folderPath = folder.label;
    let ancestorId = folder.parentFolderId;
    const pathVisited = new Set([folder.id]);
    while (ancestorId && !pathVisited.has(ancestorId)) {
      pathVisited.add(ancestorId);
      const ancestor = tenant.dashboardFolders.find((item) => item.id === ancestorId);
      if (!ancestor) break;
      folderPath = `${ancestor.label}/${folderPath}`;
      ancestorId = ancestor.parentFolderId;
    }
    parsed.data.folderName = folderPath;
  } else if (existing?.folderId) {
    if (folderAccessLevelForUser(tenant, existing.folderId, principal.userId) !== 'Manager'
      && !principal.permissions.includes('dashboards:manage')) {
      return res.status(403).json({ error: 'Manager access to the current folder is required to move this dashboard out of it' });
    }
    parsed.data.folderName = 'Private Reports';
  }
  if (existing?.status === 'Deployed' && parsed.data.status === 'Draft'
    && tenant.dashboardSubscriptions.some((subscription) => subscription.dashboardApiName === apiName && subscription.active)) {
    return res.status(409).json({ error: 'Pause or delete active dashboard subscriptions before unpublishing this dashboard' });
  }
  const conflictingName = tenant.dashboards.find((dashboard) =>
    dashboard.apiName.toLowerCase() === parsed.data.apiName.toLowerCase() && dashboard.apiName !== parsed.data.apiName);
  if (conflictingName) return res.status(409).json({ error: `Dashboard API name "${parsed.data.apiName}" conflicts with "${conflictingName.apiName}"` });
  const unknownSharedUser = parsed.data.sharedUserIds.find((userId) =>
    !tenant.accessControl.users.some((user) => user.id === userId));
  if (unknownSharedUser) return res.status(400).json({ error: `Dashboard sharing references unknown tenant user "${unknownSharedUser}"` });
  const unknownSharedGroup = parsed.data.sharedPermissionSetGroupIds.find((groupId) =>
    !tenant.accessControl.permissionSetGroups.some((group) => group.id === groupId));
  if (unknownSharedGroup) return res.status(400).json({ error: `Dashboard sharing references unknown permission set group "${unknownSharedGroup}"` });
  for (const [index, component] of parsed.data.components.entries()) {
    if (component.type === 'Custom') {
      const registered = getState().libraryComponents.find((item) =>
        item.apiName === component.customComponentApiName && item.surfaces.includes('dashboard')
          && libraryComponentVisible(item, principal.tenantId, Object.keys(getState().tenants)));
      if (!registered) return res.status(422).json({ error: `Custom dashboard component "${component.customComponentApiName ?? component.title}" is not available in the component library` });
    }
    const report = component.reportApiName
      ? tenant.reports.find((item) => item.apiName === component.reportApiName)
      : undefined;
    if (component.reportApiName && !report) return res.status(422).json({ error: `Dashboard component "${component.title}" references an unavailable report` });
    if (report && report.objectApiName !== component.objectApiName) {
      return res.status(422).json({ error: `Dashboard component "${component.title}" must use the report's source object "${report.objectApiName}"` });
    }
    if (report) {
      const reportFields = new Set([...report.fieldApiNames, ...report.groupByFieldApiNames, ...(report.columnGroupByFieldApiName ? [report.columnGroupByFieldApiName] : [])]);
      const unavailableField = [
        ...(component.measureFieldApiName ? [component.measureFieldApiName] : []),
        ...(component.groupByFieldApiName ? [component.groupByFieldApiName] : []),
        ...(component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
        ...(component.xAxisFieldApiName ? [component.xAxisFieldApiName] : []),
        ...component.displayFieldApiNames
      ].find((fieldApiName) => !reportFields.has(fieldApiName));
      if (unavailableField) {
        return res.status(422).json({ error: `Dashboard component "${component.title}" references field "${unavailableField}" that is not included in report "${report.label}"` });
      }
      if (component.type === 'Chart' && component.groupByFieldApiName
        && !report.groupByFieldApiNames.includes(component.groupByFieldApiName)) {
        return res.status(422).json({ error: `Dashboard chart "${component.title}" must group by a field summarized by report "${report.label}"` });
      }
      if (component.type === 'Chart' && component.seriesFieldApiName
        && !report.groupByFieldApiNames.includes(component.seriesFieldApiName)) {
        return res.status(422).json({ error: `Dashboard chart "${component.title}" must use a series field summarized by report "${report.label}"` });
      }
      if (component.type === 'Chart' && component.chartType === 'Scatter'
        && !report.groupByFieldApiNames.includes(component.xAxisFieldApiName ?? '')) {
        return res.status(422).json({ error: `Scatter chart "${component.title}" must use a field grouped by report "${report.label}" for its x-axis` });
      }
    }
    if (component.type === 'Custom') continue;
    if (component.type === 'Rich Text' || component.type === 'Image') continue;
    const object = tenant.objects.find((candidate) => candidate.apiName === component.objectApiName);
    if (!object) return res.status(400).json({ error: `Dashboard component "${component.title}" references unknown object "${component.objectApiName}"` });
    if (!object.settings?.allowReports) return res.status(422).json({ error: `Reports must be enabled for "${object.label}" before using it on a dashboard` });
    const fieldNames = new Set(object.fields.map((field) => field.apiName));
    const selectedFields = [
      ...(component.measureFieldApiName ? [component.measureFieldApiName] : []),
      ...(component.groupByFieldApiName ? [component.groupByFieldApiName] : []),
      ...(component.seriesFieldApiName ? [component.seriesFieldApiName] : []),
      ...(component.xAxisFieldApiName ? [component.xAxisFieldApiName] : []),
      ...component.displayFieldApiNames
    ];
    const unknownField = selectedFields.find((fieldName) => !fieldNames.has(fieldName));
    if (unknownField) return res.status(400).json({ error: `Dashboard component "${component.title}" references unknown field "${unknownField}" on "${object.label}"` });
    if (component.aggregation !== 'Count') {
      const measure = object.fields.find((field) => field.apiName === component.measureFieldApiName);
      if (!isNumericField(measure)) {
        return res.status(422).json({ error: `Dashboard component "${component.title}" requires a numeric measure field for ${component.aggregation}` });
      }
    }
    if (component.type === 'Chart' && component.groupByFieldApiName && !fieldNames.has(component.groupByFieldApiName)) {
      return res.status(400).json({ error: `Dashboard chart "${component.title}" references an unknown grouping field` });
    }
    if (component.type === 'Chart' && component.chartType === 'Scatter') {
      const xField = object.fields.find((field) => field.apiName === component.xAxisFieldApiName);
      if (!isNumericField(xField)) {
        return res.status(422).json({ error: `Scatter chart "${component.title}" requires a numeric x-axis field` });
      }
    }
  }
  for (const filter of parsed.data.filters) {
    const object = tenant.objects.find((candidate) => candidate.apiName === filter.objectApiName);
    const field = object?.fields.find((candidate) => candidate.apiName === filter.fieldApiName);
    if (!object || !object.settings?.allowReports || !field) {
      return res.status(400).json({ error: `Dashboard filter references unknown field "${filter.fieldApiName}" on "${filter.objectApiName}"` });
    }
    if (!dashboardFilterOperatorAllowed(field, filter.operator)) {
      return res.status(422).json({ error: `Operator "${filter.operator}" is not valid for dashboard filter field "${object.apiName}.${field.apiName}"` });
    }
    const invalidValue = dashboardFilterValueError(field, filter.value);
    if (invalidValue) return res.status(422).json({ error: `Dashboard filter value is invalid for "${object.apiName}.${field.apiName}": ${invalidValue}` });
  }
  const dashboardToSave = {
    ...parsed.data,
    components: parsed.data.components.map((component) => component.type === 'Rich Text'
      ? { ...component, richTextContent: sanitizeDashboardRichText(component.richTextContent) }
      : component)
  };
  const updatedTenant = {
    ...tenant,
    dashboards: tenant.dashboards.some((dashboard) => dashboard.apiName === parsed.data.apiName)
      ? tenant.dashboards.map((dashboard) => dashboard.apiName === parsed.data.apiName ? dashboardToSave : dashboard)
      : [...tenant.dashboards, dashboardToSave]
  };
  const nextState = { ...getState(), tenants: { ...getState().tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  setState(nextState);
  return res.json({ dashboard: dashboardForUser(updatedTenant, dashboardToSave, principal.userId) });
});
app.delete('/api/metadata/dashboards/:apiName', requirePermission('metadata:read'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const apiName = routeParam(req, 'apiName');
  const existing = tenant.dashboards.find((dashboard) => dashboard.apiName === apiName);
  if (!existing) {
    return res.status(404).json({ error: 'Dashboard was not found' });
  }
  if (!canEditDashboard(
    dashboardForUser(tenant, existing, principal.userId),
    principal.userId,
    principal.permissions.includes('dashboards:manage')
  )) {
    return res.status(403).json({ error: 'Dashboard editor access is required to delete it' });
  }
  const referencingPages = tenant.pages.filter(page => page.components.some(component =>
    component.type === 'Dashboard' && component.properties.dashboardApiName === apiName));
  if (referencingPages.length) return res.status(409).json({ error:
    'Dashboard is embedded in Lightning page(s): ' + referencingPages.map(page => page.apiName).join(', ')
  });
  const updatedTenant = {
    ...tenant,
    dashboards: tenant.dashboards.filter((dashboard) => dashboard.apiName !== apiName),
    dashboardSnapshots: tenant.dashboardSnapshots.filter((snapshot) => snapshot.dashboardApiName !== apiName),
    dashboardSubscriptions: tenant.dashboardSubscriptions.filter((subscription) => subscription.dashboardApiName !== apiName)
  };
  const nextState = { ...getState(), tenants: { ...getState().tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  setState(nextState);
  return res.status(204).end();
});
}
