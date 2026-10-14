/** Record API handlers. All platform services are injected, preserving tenant/RBAC checks. */
import type { Request, Response } from 'express';
import type { RecordRoutesDependencies, TenantData, RuntimeRecord, LocalUser, PlatformState } from '../../index.js';
import type { Principal } from '../../auth.js';

export function registerRecordRoutes(deps: RecordRoutesDependencies): void {
  const { app, accessAuthentication, accessControlSchema, recordShareSchema, recordActivitySchema, chatterCommentSchema, chatterPostSchema, appendFieldHistory, profileIdForRole, persistState, getState, setState, tenantIsActive, withSecurityEvent, tenantData, getPrincipal, principalUser, effectivePermissions, disableOnConnectorUninstall, assertConnectorLifecycleAccess, canOpenApp, hasObjectPermission, hasObjectWidePermission, queueContainsUser, hasRecordAccess, hasFieldPermission, sanitizeRecordForRead, assertFieldEditPermissions, profileIdForPrincipal, resolveActiveLightningRecordPage, hasRecordTypeAccessForUser, applyRecordDefaults, persistTenantRecords, deleteRecordCascade, routeParam, formulaContextForUser, validateRuntimeRecord, runRecordTriggeredFlows, runBeforeSaveRecordTriggeredFlows, calculateFormulaFields, sanitizeRecordValues, withCaseClosedDate, recordUnmodified, stampRecordAuditFields, recordActionEnabled, normalizeFlowRecordAssignments, validateRelationshipReparenting, waitForPersistedState, randomUUID, applyConnectorLifecycle, z, hashPassword } = deps;
function canManageRecordShares(principal: Principal, tenant: TenantData, objectName: string, record: RuntimeRecord): boolean {
  return record.OwnerId === principal.userId
    || hasObjectWidePermission(principal, tenant, objectName, 'modifyAll')
    || principal.permissions.includes('security:manage');
}

app.get('/api/records/:objectName/:recordId/shares', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const record = (tenant.records[objectName] ?? []).find((item) => item.Id === recordId);
  if (!record) return res.status(404).json({ error: 'Record was not found' });
  if (!canManageRecordShares(principal, tenant, objectName, record)) {
    return res.status(403).json({ error: 'Only the record owner, a Modify All user, or a security administrator can manage record shares' });
  }
  const users = new Map(getState().users.filter((user) => user.tenantId === principal.tenantId).map((user) => [user.id, user]));
  const groups = new Map(tenant.accessControl.publicGroups.map((group) => [group.id, group]));
  const shares = tenant.recordShares
    .filter((share) => share.objectApiName === objectName && share.recordId === recordId)
    .map((share) => ({
      ...share,
      targetLabel: share.userId ? users.get(share.userId)?.name ?? 'Unknown User'
        : groups.get(share.groupId ?? '')?.label ?? 'Unknown Public Group'
    }));
  return res.json({ shares });
});

app.post('/api/records/:objectName/:recordId/shares', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const record = (tenant.records[objectName] ?? []).find((item) => item.Id === recordId);
  if (!record) return res.status(404).json({ error: 'Record was not found' });
  if (!canManageRecordShares(principal, tenant, objectName, record)) {
    return res.status(403).json({ error: 'Only the record owner, a Modify All user, or a security administrator can manage record shares' });
  }
  const input = z.object({
    userId: z.string().min(1).optional(),
    groupId: z.string().min(1).optional(),
    accessLevel: z.enum(['Read', 'Edit'])
  }).strict().superRefine((value, context) => {
    if (Boolean(value.userId) === Boolean(value.groupId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['userId'], message: 'Specify exactly one active user or public group' });
    }
  }).safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'A target user or public group and Read or Edit access level are required' });
  const targetUser = input.data.userId ? getState().users.find((user) =>
    user.id === input.data.userId && user.tenantId === principal.tenantId && !user.disabled) : undefined;
  const targetGroup = input.data.groupId
    ? tenant.accessControl.publicGroups.find((group) => group.id === input.data.groupId) : undefined;
  if (input.data.userId && !targetUser) return res.status(400).json({ error: 'Shares can only be granted to an active user in this tenant' });
  if (input.data.groupId && !targetGroup) return res.status(400).json({ error: 'Shares can only be granted to an existing public group in this tenant' });
  if (targetUser?.id === record.OwnerId) return res.status(400).json({ error: 'The record owner already has full access' });
  const target = targetUser ? { userId: targetUser.id } : { groupId: targetGroup!.id };
  const share = recordShareSchema.parse({
    id: randomUUID(), objectApiName: objectName, recordId, ...target, accessLevel: input.data.accessLevel, rowCause: 'Manual',
    createdBy: principal.userId, createdAt: new Date().toISOString()
  });
  const recordShares = [
    ...tenant.recordShares.filter((item) => !(item.objectApiName === objectName && item.recordId === recordId
      && item.userId === target.userId && item.groupId === target.groupId)),
    share
  ];
  persistTenantRecords(principal.tenantId, { ...tenant, recordShares });
  return res.status(201).json({ share });
});

app.delete('/api/records/:objectName/:recordId/shares/:userId', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const userId = routeParam(req, 'userId');
  const record = (tenant.records[objectName] ?? []).find((item) => item.Id === recordId);
  if (!record) return res.status(404).json({ error: 'Record was not found' });
  if (!canManageRecordShares(principal, tenant, objectName, record)) {
    return res.status(403).json({ error: 'Only the record owner, a Modify All user, or a security administrator can manage record shares' });
  }
  if (!tenant.recordShares.some((share) => share.objectApiName === objectName && share.recordId === recordId && share.userId === userId)) {
    return res.status(404).json({ error: 'Manual record share was not found' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    recordShares: tenant.recordShares.filter((share) =>
      !(share.objectApiName === objectName && share.recordId === recordId && share.userId === userId))
  });
  return res.status(204).end();
});

app.delete('/api/records/:objectName/:recordId/shares/groups/:groupId', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const groupId = routeParam(req, 'groupId');
  const record = (tenant.records[objectName] ?? []).find((item) => item.Id === recordId);
  if (!record) return res.status(404).json({ error: 'Record was not found' });
  if (!canManageRecordShares(principal, tenant, objectName, record)) {
    return res.status(403).json({ error: 'Only the record owner, a Modify All user, or a security administrator can manage record shares' });
  }
  if (!tenant.recordShares.some((share) => share.objectApiName === objectName && share.recordId === recordId && share.groupId === groupId)) {
    return res.status(404).json({ error: 'Manual public-group record share was not found' });
  }
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    recordShares: tenant.recordShares.filter((share) =>
      !(share.objectApiName === objectName && share.recordId === recordId && share.groupId === groupId))
  });
  return res.status(204).end();
});

app.get('/api/records/:objectName', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  if (!tenant.objects.some((object) => object.apiName === objectName)) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (!hasObjectPermission(principal, tenant, objectName, 'read')) return res.status(403).json({ error: `Missing read permission for object "${objectName}"` });
  const object = tenant.objects.find((item) => item.apiName === objectName)!;
  const paginated = req.query.limit !== undefined || req.query.offset !== undefined || req.query.search !== undefined || req.query.filterField !== undefined || req.query.sortField !== undefined;
  const rawLimit = Number(req.query.limit ?? 50);
  const rawOffset = Number(req.query.offset ?? 0);
  if (paginated && (!Number.isSafeInteger(rawLimit) || rawLimit < 1 || rawLimit > 200
    || !Number.isSafeInteger(rawOffset) || rawOffset < 0)) {
    return res.status(400).json({ error: 'Invalid pagination: limit must be 1–200 and offset must be non-negative' });
  }
  const relatedField = req.query.relatedField;
  const relatedId = req.query.relatedId;
  if ((relatedField !== undefined || relatedId !== undefined)
    && (typeof relatedField !== 'string' || typeof relatedId !== 'string'
      || !object.fields.some((field) => field.apiName === relatedField && field.relationship))) {
    return res.status(400).json({ error: 'Invalid related-list filter' });
  }
  // Related-list predicates must not expose fields hidden by FLS.
  if (typeof relatedField === 'string' &&
      !hasFieldPermission(principal, tenant, objectName, relatedField, 'read'))
    return res.status(403).json({ error: 'Missing field read permission for related-list filter' });
  const filterField = req.query.filterField;
  const filterValue = req.query.filterValue;
  if ((filterField !== undefined || filterValue !== undefined) &&
    (typeof filterField !== 'string' || typeof filterValue !== 'string' || filterValue.length > 250 ||
      !object.fields.some((field) => field.apiName === filterField))) {
    return res.status(400).json({ error: 'Invalid record field filter' });
  }
  // A filtered query must not reveal information from fields hidden by the user's permission set.
  if (typeof filterField === 'string' && !hasFieldPermission(principal, tenant, objectName, filterField, 'read')) {
    return res.status(403).json({ error: 'Missing field read permission for filter' });
  }
  const rawSearch = req.query.search;
  if (rawSearch !== undefined && (typeof rawSearch !== 'string' || rawSearch.length > 250)) {
    return res.status(400).json({ error: 'Invalid search query' });
  }
  const records = objectName === 'User'
    ? getState().users.filter((user) => user.tenantId === principal.tenantId).map((user) => sanitizeRecordForRead(principal, tenant, object, ({
        Id: user.id, Name: user.name, Email: user.email, Username: user.email, IsActive: !user.disabled,
        UserRoleId: user.role, CreatedDate: user.createdAt, LastModifiedDate: user.createdAt
      })))
    : (tenant.records[objectName] ?? [])
        .filter((record) => hasRecordAccess(principal, tenant, objectName, record, 'Read'))
        .map((record) => sanitizeRecordForRead(principal, tenant, object, record));
  // Search only fields visible to this principal; preserve metadata-configured search layouts.
  const configuredFields = object.searchLayouts?.searchResults;
  const searchFields = configuredFields !== undefined
    ? object.fields.filter((field) => configuredFields.includes(field.apiName))
    : object.fields;
  const needle = typeof rawSearch === 'string' ? rawSearch.trim().toLocaleLowerCase() : '';
  const scopedRecords = typeof relatedField === 'string' && typeof relatedId === 'string'
    ? records.filter((record) => record[relatedField] === relatedId)
    : records;
  const exactFiltered = typeof filterField === 'string' && typeof filterValue === 'string'
    ? scopedRecords.filter((record) => String(record[filterField] ?? '') === filterValue)
    : scopedRecords;
  const filtered = needle
    ? exactFiltered.filter((record) => searchFields.some((field) =>
        Object.prototype.hasOwnProperty.call(record, field.apiName)
        && String(record[field.apiName] ?? '').toLocaleLowerCase().includes(needle)))
    : exactFiltered;
  // Sort authorised values before taking a page; reject sorting hidden fields
  // because even record ordering can reveal restricted field information.
  const sortField = req.query.sortField;
  const sortDirection = req.query.sortDirection;
  if (sortField !== undefined || sortDirection !== undefined) {
    if (typeof sortField !== 'string' || !sortField || (sortDirection !== 'asc' && sortDirection !== 'desc')
      || (sortField !== 'Id' && !object.fields.some((field) => field.apiName === sortField)))
      return res.status(400).json({ error: 'Invalid sort field or direction' });
    if (sortField !== 'Id' && !hasFieldPermission(principal, tenant, objectName, sortField, 'read'))
      return res.status(403).json({ error: 'Missing field read permission for sort' });
  }
  const sortType = typeof sortField === 'string' ? object.fields.find((field) => field.apiName === sortField)?.dataType ?? '' : '';
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const ordered = typeof sortField === 'string' ? [...filtered].sort((left, right) => {
    const a = left[sortField];
    const b = right[sortField];
    const aMissing = a === null || a === undefined || a === '';
    const bMissing = b === null || b === undefined || b === '';
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    let comparison = 0;
    if (!aMissing && !bMissing) {
      if (sortType.startsWith('Number') || sortType.startsWith('Currency') || sortType.startsWith('Percent')) comparison = Number(a) - Number(b);
      else if (['Date', 'Date/Time', 'DateTime'].includes(sortType)) comparison = new Date(String(a)).getTime() - new Date(String(b)).getTime();
      else comparison = collator.compare(String(a), String(b));
    }
    if (!Number.isFinite(comparison)) comparison = collator.compare(String(a), String(b));
    return comparison ? (sortDirection === 'desc' ? -Math.sign(comparison) : Math.sign(comparison))
      : collator.compare(String(left.Id), String(right.Id));
  }) : filtered;
  if (!paginated) return res.json({ records: ordered });
  return res.json({
    records: ordered.slice(rawOffset, rawOffset + rawLimit),
    total: filtered.length,
    offset: rawOffset,
    limit: rawLimit
  });
});
app.get('/api/records/:objectName/:recordId', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  if (!tenant.objects.some((object) => object.apiName === objectName)) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (!hasObjectPermission(principal, tenant, objectName, 'read')) return res.status(403).json({ error: `Missing read permission for object "${objectName}"` });
  const object = tenant.objects.find((item) => item.apiName === objectName)!;
  const requestedAppId = req.query.appId;
  const appId = typeof requestedAppId === 'string' && requestedAppId ? requestedAppId : 'Records';
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(appId)) return res.status(400).json({ error: 'Invalid app API name' });
  if (!tenant.apps.some((app) => app.apiName === appId)) return res.status(400).json({ error: `Unknown Lightning app "${appId}"` });
  // Object access does not confer visibility of an explicitly selected app's page.
  if (typeof requestedAppId === 'string' && requestedAppId &&
      !canOpenApp(principal, tenant, appId))
    return res.status(404).json({ error: 'Lightning app was not found' });
  const requestedFormFactor = req.query.formFactor;
  if (requestedFormFactor !== undefined && requestedFormFactor !== 'Desktop' && requestedFormFactor !== 'Phone') {
    return res.status(400).json({ error: 'Form factor must be Desktop or Phone' });
  }
  const formFactor = requestedFormFactor === 'Phone' ? 'Phone' : 'Desktop';
  const resolvePage = (recordTypeId?: string) => resolveActiveLightningRecordPage(
    tenant,
    objectName,
    appId,
    recordTypeId,
    profileIdForPrincipal(principal, tenant),
    formFactor
  );
  if (objectName === 'User') {
    const user = getState().users.find((item) => item.id === routeParam(req, 'recordId') && item.tenantId === principal.tenantId);
    if (!user) return res.status(404).json({ error: 'Record was not found' });
    const lightningPage = resolvePage();
    return res.json({ record: sanitizeRecordForRead(principal, tenant, object, ({
      Id: user.id, Name: user.name, Email: user.email, Username: user.email, IsActive: !user.disabled,
      UserRoleId: user.role, CreatedDate: user.createdAt, LastModifiedDate: user.createdAt
    })), ...(lightningPage ? { lightningPage } : {}) });
  }
  const record = (tenant.records[objectName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!record || !hasRecordAccess(principal, tenant, objectName, record, 'Read')) return res.status(404).json({ error: 'Record was not found' });
  const recordTypeId = typeof record.RecordTypeId === 'string'
    ? record.RecordTypeId
    : object.recordTypes?.find((recordType) => recordType.active && recordType.isDefault)?.id
      ?? object.recordTypes?.find((recordType) => recordType.active)?.id;
  const lightningPage = resolvePage(recordTypeId);
  return res.json({
    record: sanitizeRecordForRead(principal, tenant, object, record),
    ...(lightningPage ? { lightningPage } : {})
  });
});
const activityInputSchema = z.object({
  kind: z.enum(['Task', 'Call', 'Event']),
  subject: z.string().trim().min(1).max(160),
  description: z.string().max(4000).default(''),
  status: z.enum(['Open', 'Completed']).default('Open'),
  dueAt: z.string().datetime().nullable().default(null)
}).strict();
const chatterPostInputSchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict();
function interactionRecord(principal: Principal, tenant: TenantData, objectApiName: string, recordId: string, permission: 'read' | 'edit') {
  const object = tenant.objects.find((item) => item.apiName === objectApiName);
  if (!object) return { error: { status: 404, message: `Object "${objectApiName}" was not found` } } as const;
  const featureEnabled = object.settings?.allowActivities;
  if (permission === 'read' && !hasObjectPermission(principal, tenant, objectApiName, 'read')) {
    return { error: { status: 403, message: `Missing read permission for object "${objectApiName}"` } } as const;
  }
  if (permission === 'edit' && !hasObjectPermission(principal, tenant, objectApiName, 'edit')) {
    return { error: { status: 403, message: `Missing edit permission for object "${objectApiName}"` } } as const;
  }
  if (!featureEnabled) return { error: { status: 409, message: `Activities are disabled for object "${object.label}"` } } as const;
  const record = (tenant.records[objectApiName] ?? []).find((item) => item.Id === recordId);
  if (!record || !hasRecordAccess(principal, tenant, objectApiName, record, permission === 'read' ? 'Read' : 'Edit')) {
    return { error: { status: 404, message: 'Record was not found' } } as const;
  }
  return { object, record } as const;
}
app.get('/api/records/:objectName/:recordId/activities', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectApiName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const context = interactionRecord(principal, tenant, objectApiName, recordId, 'read');
  if ('error' in context && context.error) return res.status(context.error.status).json({ error: context.error.message });
  const activities = tenant.activities
    .filter((activity) => activity.objectApiName === objectApiName && activity.recordId === recordId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return res.json({ activities });
});
app.post('/api/records/:objectName/:recordId/activities', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectApiName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const context = interactionRecord(principal, tenant, objectApiName, recordId, 'edit');
  if ('error' in context && context.error) return res.status(context.error.status).json({ error: context.error.message });
  const parsed = activityInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid activity', details: parsed.error.flatten() });
  const user = principalUser(principal);
  if (!user) return res.status(401).json({ error: 'Authenticated user is no longer active' });
  const activity = recordActivitySchema.parse({
    ...parsed.data, id: randomUUID(), objectApiName, recordId,
    createdBy: user.id, createdByName: user.name, createdAt: new Date().toISOString()
  });
  persistTenantRecords(principal.tenantId, { ...tenant, activities: [...tenant.activities, activity] });
  return res.status(201).json({ activity });
});
app.patch('/api/records/:objectName/:recordId/activities/:activityId', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectApiName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const context = interactionRecord(principal, tenant, objectApiName, recordId, 'edit');
  if ('error' in context && context.error) return res.status(context.error.status).json({ error: context.error.message });
  const parsed = z.object({ status: z.enum(['Open', 'Completed']) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid activity update', details: parsed.error.flatten() });
  const activityId = routeParam(req, 'activityId');
  const activity = tenant.activities.find((item) => item.id === activityId
    && item.objectApiName === objectApiName && item.recordId === recordId);
  if (!activity) return res.status(404).json({ error: 'Activity was not found' });
  const updatedActivity = { ...activity, status: parsed.data.status };
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    activities: tenant.activities.map((item) => item.id === activityId ? updatedActivity : item)
  });
  return res.json({ activity: updatedActivity });
});
app.get('/api/records/:objectName/:recordId/chatter', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectApiName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectApiName);
  if (!object) return res.status(404).json({ error: `Object "${objectApiName}" was not found` });
  if (!hasObjectPermission(principal, tenant, objectApiName, 'read')) return res.status(403).json({ error: `Missing read permission for object "${objectApiName}"` });
  if (!object.settings?.allowInChatter) return res.status(409).json({ error: `Chatter is disabled for object "${object.label}"` });
  const record = (tenant.records[objectApiName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!record || !hasRecordAccess(principal, tenant, objectApiName, record, 'Read')) return res.status(404).json({ error: 'Record was not found' });
  const posts = tenant.chatterPosts
    .filter((post) => post.objectApiName === objectApiName && post.recordId === record.Id)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return res.json({ posts });
});
app.post('/api/records/:objectName/:recordId/chatter', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectApiName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectApiName);
  if (!object) return res.status(404).json({ error: `Object "${objectApiName}" was not found` });
  if (!hasObjectPermission(principal, tenant, objectApiName, 'edit')) return res.status(403).json({ error: `Missing edit permission for object "${objectApiName}"` });
  if (!object.settings?.allowInChatter) return res.status(409).json({ error: `Chatter is disabled for object "${object.label}"` });
  const record = (tenant.records[objectApiName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!record || !hasRecordAccess(principal, tenant, objectApiName, record, 'Edit')) return res.status(404).json({ error: 'Record was not found' });
  const parsed = chatterPostInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Chatter post', details: parsed.error.flatten() });
  const user = principalUser(principal);
  if (!user) return res.status(401).json({ error: 'Authenticated user is no longer active' });
  const post = chatterPostSchema.parse({
    ...parsed.data, id: randomUUID(), objectApiName, recordId: record.Id,
    createdBy: user.id, createdByName: user.name, createdAt: new Date().toISOString(), comments: []
  });
  persistTenantRecords(principal.tenantId, { ...tenant, chatterPosts: [...tenant.chatterPosts, post] });
  return res.status(201).json({ post });
});
app.post('/api/records/:objectName/:recordId/chatter/:postId/comments', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectApiName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectApiName);
  if (!object) return res.status(404).json({ error: `Object "${objectApiName}" was not found` });
  if (!hasObjectPermission(principal, tenant, objectApiName, 'edit')) return res.status(403).json({ error: `Missing edit permission for object "${objectApiName}"` });
  if (!object.settings?.allowInChatter) return res.status(409).json({ error: `Chatter is disabled for object "${object.label}"` });
  const record = (tenant.records[objectApiName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!record || !hasRecordAccess(principal, tenant, objectApiName, record, 'Edit')) return res.status(404).json({ error: 'Record was not found' });
  const parsed = chatterPostInputSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid Chatter comment', details: parsed.error.flatten() });
  const user = principalUser(principal);
  if (!user) return res.status(401).json({ error: 'Authenticated user is no longer active' });
  const postId = routeParam(req, 'postId');
  const post = tenant.chatterPosts.find((item) => item.id === postId
    && item.objectApiName === objectApiName && item.recordId === record.Id);
  if (!post) return res.status(404).json({ error: 'Chatter post was not found' });
  const comment = chatterCommentSchema.parse({
    ...parsed.data, id: randomUUID(), createdBy: user.id, createdByName: user.name, createdAt: new Date().toISOString()
  });
  const updatedPost = { ...post, comments: [...post.comments, comment] };
  persistTenantRecords(principal.tenantId, {
    ...tenant,
    chatterPosts: tenant.chatterPosts.map((item) => item.id === postId ? updatedPost : item)
  });
  return res.status(201).json({ post: updatedPost });
});
app.get('/api/records/:objectName/:recordId/history', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (!hasObjectPermission(principal, tenant, objectName, 'read')) return res.status(403).json({ error: `Missing read permission for object "${objectName}"` });
  const record = (tenant.records[objectName] ?? []).find((item) => item.Id === recordId);
  if (!record || !hasRecordAccess(principal, tenant, objectName, record, 'Read')) return res.status(404).json({ error: 'Record was not found' });
  const fieldLabels = new Map(object.fields.map((field) => [field.apiName, field.label]));
  const users = new Map(getState().users.map((user) => [user.id, user.name]));
  const history = tenant.fieldHistory.filter((entry) => entry.objectApiName === objectName && entry.recordId === recordId
    && hasFieldPermission(principal, tenant, objectName, entry.fieldApiName, 'read'))
    .sort((left, right) => right.changedAt.localeCompare(left.changedAt))
    .map((entry) => ({
      ...entry,
      fieldLabel: fieldLabels.get(entry.fieldApiName) ?? entry.fieldApiName,
      changedByName: users.get(entry.changedBy) ?? 'Unknown User'
    }));
  return res.json({ history });
});
app.post('/api/campaigns/:campaignId/members', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const campaignObject = tenant.objects.find((object) => object.apiName === 'Campaign');
  const contactObject = tenant.objects.find((object) => object.apiName === 'Contact');
  if (!campaignObject || !contactObject) return res.status(404).json({ error: 'Campaign or Contact object is unavailable' });
  if (!contactObject.listViewButtons?.includes('Add to Campaign')) return res.status(403).json({ error: 'Add to Campaign is not enabled for Contact list views' });
  if (!hasObjectPermission(principal, tenant, 'Campaign', 'edit') || !hasObjectPermission(principal, tenant, 'Contact', 'read')) {
    return res.status(403).json({ error: 'Adding contacts requires Campaign edit and Contact read permissions' });
  }
  const campaignId = routeParam(req, 'campaignId');
  const campaign = (tenant.records.Campaign ?? []).find((record) => record.Id === campaignId);
  if (!campaign || !hasRecordAccess(principal, tenant, 'Campaign', campaign, 'Edit')) return res.status(404).json({ error: 'Campaign was not found' });
  if (campaign.IsActive === false) return res.status(422).json({ error: 'Contacts cannot be added to an inactive campaign' });
  if (!recordActionEnabled(campaignObject, 'Edit', typeof campaign.RecordTypeId === 'string' ? campaign.RecordTypeId : undefined, profileIdForPrincipal(principal, tenant))) {
    return res.status(403).json({ error: 'Edit is not enabled for Campaign' });
  }
  const parsed = z.object({ contactIds: z.array(z.string().min(1)).min(1) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Provide at least one Contact ID', details: parsed.error.flatten() });
  const contactIds = [...new Set(parsed.data.contactIds)];
  const contacts = tenant.records.Contact ?? [];
  const accessibleContacts = contactIds.map((id) => contacts.find((record) => record.Id === id))
    .filter((record): record is RuntimeRecord => Boolean(record && hasRecordAccess(principal, tenant, 'Contact', record, 'Read')));
  if (accessibleContacts.length !== contactIds.length) return res.status(404).json({ error: 'One or more Contacts were not found or are not accessible' });
  const existingContactIds = new Set(tenant.campaignMembers.filter((member) => member.campaignId === campaignId).map((member) => member.contactId));
  const newMembers = accessibleContacts.filter((contact) => !existingContactIds.has(contact.Id)).map((contact) => ({
    id: randomUUID(),
    campaignId,
    contactId: contact.Id,
    status: 'Sent' as const,
    createdBy: principal.userId,
    createdAt: new Date().toISOString()
  }));
  persistTenantRecords(principal.tenantId, { ...tenant, campaignMembers: [...tenant.campaignMembers, ...newMembers] });
  return res.status(201).json({ addedCount: newMembers.length, alreadyMemberCount: contactIds.length - newMembers.length });
});

/**
 * User is a security identity backed by getState().users and accessControl.users,
 * not an ordinary tenant record. Keep these identities in sync and never
 * let generic record writes bypass authentication and security controls.
 */
const userRecordWriteSchema = z.object({
  Name: z.string().trim().min(1).max(121),
  Email: z.string().email(),
  Username: z.string().email(),
  IsActive: z.boolean().default(true),
  UserRoleId: z.string().min(1),
  Password: z.string().min(12).max(256)
}).strict();
const userRecordEditSchema = userRecordWriteSchema.omit({ Password: true }).partial().strict();
function userWriteRight(principal: Principal, tenant: TenantData, operation: 'create' | 'edit' | 'delete') {
  return principal.permissions.includes('security:manage') && hasObjectPermission(principal, tenant, 'User', operation);
}
function userRoleFromValue(tenant: TenantData, value: string) {
  return tenant.accessControl.roles.find((role) => role.id === value || role.name === value);
}
function safeUserIdentity(record: LocalUser) {
  return { Id: record.id, Name: record.name, Email: record.email, Username: record.email,
    IsActive: !record.disabled, UserRoleId: record.role, CreatedDate: record.createdAt, LastModifiedDate: record.createdAt };
}
app.post('/api/records/User', accessAuthentication, async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (!userWriteRight(principal, tenant, 'create')) return res.status(403).json({ error: 'Missing User create and security management permission' });
  const parsed = userRecordWriteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid user input', details: parsed.error.flatten() });
  const input = parsed.data;
  if (input.Username.trim().toLowerCase() !== input.Email.trim().toLowerCase())
    return res.status(400).json({ error: 'Username must equal Email for tenant login' });
  const email = input.Email.trim().toLowerCase();
  if (getState().users.some((item) => item.email.toLowerCase() === email))
    return res.status(409).json({ error: 'Email is already registered' });
  const role = userRoleFromValue(tenant, input.UserRoleId);
  if (!role) return res.status(400).json({ error: 'Select an existing tenant role' });
  const profileId = profileIdForRole(role.name, tenant.accessControl.profiles);
  if (!tenant.accessControl.profiles.some((profile) => profile.id === profileId))
    return res.status(409).json({ error: 'No valid profile for selected role' });
  const id = randomUUID();
  const now = new Date().toISOString();
  const identity: LocalUser = {
    id, tenantId: principal.tenantId, name: input.Name, email,
    ...(await hashPassword(input.Password).then(({salt,hash}) => ({passwordSalt:salt,passwordHash:hash}))),
    role: role.name, permissionSetIds: [], permissionSetGroupIds: [],
    disabled: !input.IsActive, createdAt: now
  };
  const accessUser = {
    id, name: input.Name, username: email, role: role.name, roleId: role.id,
    profileId, permissionSetIds: [], permissionSetGroupIds: [], timeZone: 'UTC', locale: 'en-GB'
  };
  const nextAccess = { ...tenant.accessControl, users: [...tenant.accessControl.users, accessUser] };
  const validation = accessControlSchema.safeParse(nextAccess);
  if (!validation.success) return res.status(400).json({ error: 'Invalid User RBAC assignment', details: validation.error.flatten() });
  const nextState: PlatformState = { ...getState(), users: [...getState().users, identity],
    tenants: { ...getState().tenants, [principal.tenantId]: { ...tenant, accessControl: validation.data } } };
  try { persistState(nextState); setState(nextState); }
  catch { return res.status(503).json({ error: 'Unable to persist user' }); }
  return res.status(201).json({ record: safeUserIdentity(identity) });
});
app.put('/api/records/User/:recordId', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (!userWriteRight(principal, tenant, 'edit')) return res.status(403).json({ error: 'Missing User edit and security management permission' });
  const id = routeParam(req, 'recordId');
  const existing = getState().users.find((item) => item.id === id && item.tenantId === principal.tenantId);
  const existingAccess = tenant.accessControl.users.find((item) => item.id === id);
  if (!existing || !existingAccess) return res.status(404).json({ error: 'Tenant user was not found' });
  const parsed = userRecordEditSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid user changes', details: parsed.error.flatten() });
  const values = parsed.data;
  const email = (values.Email ?? existing.email).trim().toLowerCase();
  if (values.Username && values.Username.trim().toLowerCase() !== email)
    return res.status(400).json({ error: 'Username must equal Email for tenant login' });
  if (getState().users.some((item) => item.id !== id && item.email.toLowerCase() === email))
    return res.status(409).json({ error: 'Email is already registered' });
  // System Administrator is a profile/seeded login role, not a hierarchy role.
  // An IsActive/name edit must not silently downgrade its assigned profile.
  const role = values.UserRoleId
    ? userRoleFromValue(tenant, values.UserRoleId)
    : tenant.accessControl.roles.find((item) => item.id === existingAccess.roleId);
  if (!role) return res.status(400).json({ error: 'Select an existing tenant role' });
  const nextRoleName = values.UserRoleId ? role.name : existing.role;
  const disabling = values.IsActive === false;
  const revocation = Math.floor(Date.now() / 1000);
  const changedIdentity: LocalUser = { ...existing, name: values.Name ?? existing.name, email, role: nextRoleName,
    disabled: values.IsActive === undefined ? existing.disabled : !values.IsActive,
    ...(disabling || email !== existing.email || nextRoleName !== existing.role ? {authRevokedBefore:revocation}: {}) };
  const updatedAccess = { ...existingAccess, name: changedIdentity.name, username: email,
    role: nextRoleName, roleId: role.id,
    profileId: values.UserRoleId ? profileIdForRole(role.name, tenant.accessControl.profiles) : existingAccess.profileId };
  const nextAccess = { ...tenant.accessControl,
    users: tenant.accessControl.users.map((item) => item.id === id ? updatedAccess : item) };
  const validation = accessControlSchema.safeParse(nextAccess);
  if (!validation.success) return res.status(400).json({ error: 'Invalid user access configuration', details: validation.error.flatten() });
  const updatedTenant = { ...tenant, accessControl: validation.data };
  const updatedUsers = getState().users.map((item) => item.id === id ? changedIdentity : item);
  if (!updatedUsers.some((item) => item.tenantId === principal.tenantId && !item.disabled
    && effectivePermissions(item, updatedTenant).includes('security:manage')))
    return res.status(409).json({ error: 'At least one active security administrator must remain' });
  const nextState: PlatformState = { ...getState(), users: updatedUsers,
    tenants: { ...getState().tenants, [principal.tenantId]: updatedTenant },
    refreshSessions: getState().refreshSessions.map((session) => session.userId === id && (disabling || email !== existing.email || nextRoleName !== existing.role)
      ? { ...session, revokedAt: revocation } : session) };
  try { persistState(nextState); setState(nextState); }
  catch { return res.status(503).json({ error: 'Unable to persist user changes' }); }
  return res.json({ record: safeUserIdentity(changedIdentity) });
});
// Identity records are retained for audit integrity; Delete deactivates and revokes sessions.
app.delete('/api/records/User/:recordId', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  if (!userWriteRight(principal, tenant, 'delete')) return res.status(403).json({ error: 'Missing User delete and security management permission' });
  const id = routeParam(req, 'recordId');
  const existing = getState().users.find((item) => item.id === id && item.tenantId === principal.tenantId);
  if (!existing) return res.status(404).json({ error: 'Tenant user was not found' });
  if (existing.disabled) return res.status(409).json({ error: 'User is already inactive' });
  const revocation = Math.floor(Date.now() / 1000);
  const updatedUsers = getState().users.map((item) => item.id === id ? { ...item, disabled:true, authRevokedBefore:revocation } : item);
  if (!updatedUsers.some((item) => item.tenantId === principal.tenantId && !item.disabled
    && effectivePermissions(item, tenant).includes('security:manage')))
    return res.status(409).json({ error: 'At least one active security administrator must remain' });
  const nextState: PlatformState = { ...getState(), users:updatedUsers, refreshSessions:getState().refreshSessions.map((session) =>
    session.userId === id ? { ...session, revokedAt:revocation } : session) };
  try { persistState(nextState); setState(nextState); }
  catch { return res.status(503).json({ error: 'Unable to deactivate user' }); }
  return res.status(204).end();
});
/**
 * Re-evaluate every record write against the current authorisation and record
 * revision at its commit boundary. Offline clients are NOT trusted to supply
 * their own permission snapshot. This also protects long-running normal saves
 * where an admin edits RBAC while before-save/record-triggered Flows execute.
 */
function currentRecordCommitDenial(
  principal: Principal, objectName: string, action: 'create' | 'edit',
  submitted: Record<string, unknown>, opened?: RuntimeRecord
): {status: 403 | 404 | 412; error: string} | null {
  const user = getState().users.find(item => item.id === principal.userId
    && item.tenantId === principal.tenantId && !item.disabled);
  const tenant = tenantData(principal.tenantId);
  if (!user || !tenant || !tenantIsActive(principal.tenantId))
    return {status:403,error:'Your account or tenant is no longer active.'};
  const object = tenant.objects.find(item => item.apiName === objectName);
  if (!object) return {status:404,error:'Object is no longer available.'};
  const nowPrincipal: Principal = { ...principal, permissions: effectivePermissions(user,tenant) };
  if (!hasObjectPermission(nowPrincipal, tenant, objectName, action))
    return {status:403,error:'Permission changed: object ' + action + ' access is no longer granted.'};
  for (const fieldName of Object.keys(submitted)) {
    if (fieldName === 'RecordTypeId') continue;
    if (!object.fields.some(field => field.apiName === fieldName))
      return {status:412,error:'Object field metadata changed while this record was pending.'};
    if (!hasFieldPermission(nowPrincipal, tenant, objectName, fieldName, 'edit'))
      return {status:403,error:'Permission changed: field editing access is no longer granted.'};
  }
  const previous = opened
    ? (tenant.records[objectName] ?? []).find(item => item.Id === opened.Id) : null;
  if (opened && (!previous || !hasRecordAccess(nowPrincipal,tenant,objectName,previous,'Edit')))
    return {status:403,error:'Permission changed: this record can no longer be edited.'};
  if (previous && previous.LastModifiedDate !== opened?.LastModifiedDate)
    return {status:412,error:'Record changed while your update was pending. Refresh and review.'};
  const recordTypeId = typeof submitted.RecordTypeId === 'string'
    ? submitted.RecordTypeId
    : typeof previous?.RecordTypeId === 'string' ? previous.RecordTypeId : undefined;
  if (recordTypeId && !hasRecordTypeAccessForUser(nowPrincipal.userId,tenant,objectName,recordTypeId))
    return {status:403,error:'Permission changed: record type access is no longer granted.'};
  const actionName = action === 'create' ? 'New' : 'Edit';
  if (!recordActionEnabled(object,actionName,recordTypeId,profileIdForPrincipal(nowPrincipal,tenant)))
    return {status:403,error:'Permission changed: the record action is no longer available.'};
  return null;
}
app.post('/api/records/:objectName', accessAuthentication, async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (objectName === 'ConnectorProvider__c' || objectName === 'IntegrationConnection__c') {
    return res.status(403).json({ error: 'Manage connector definitions and Integration Connections in Une Connectors Setup' });
  }
  if (objectName === 'User') return res.status(403).json({ error: 'Users must be provisioned through the security workspace' });
  if (objectName === 'Connector_App__c' && !principal.permissions.includes('licence:manage')) {
    return res.status(403).json({error:'Connector app catalogue creation/deletion requires platform licence permission.'});
  }
  if (!hasObjectPermission(principal, tenant, objectName, 'create')) return res.status(403).json({ error: `Missing create permission for object "${objectName}"` });
  const parsed = z.record(z.unknown()).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Record values must be an object' });
  if (req.get('X-MetaDrive-Offline-Sync') === '1') {
    const knownFields = new Set(object.fields.map(field => field.apiName));
    if (Object.keys(parsed.data).some(key => key !== 'RecordTypeId' && !knownFields.has(key)))
      return res.status(412).json({error:'Record schema changed while offline. Review your draft before retrying.'});
  }
  const requestedCloneId = req.query.cloneFromId;
  if (requestedCloneId !== undefined && (typeof requestedCloneId !== 'string' || !requestedCloneId.trim())) {
    return res.status(400).json({ error: 'cloneFromId must be a non-empty record ID' });
  }
  const cloneSource = typeof requestedCloneId === 'string'
    ? (tenant.records[objectName] ?? []).find((record) => record.Id === requestedCloneId)
    : undefined;
  if (typeof requestedCloneId === 'string'
    && (!cloneSource || !hasRecordAccess(principal, tenant, objectName, cloneSource, 'Read'))) {
    return res.status(404).json({ error: 'Clone source record was not found' });
  }
  const recordTypeId = typeof parsed.data.RecordTypeId === 'string'
    ? parsed.data.RecordTypeId
    : typeof cloneSource?.RecordTypeId === 'string' ? cloneSource.RecordTypeId : undefined;
  if (recordTypeId && !hasRecordTypeAccessForUser(principal.userId, tenant, objectName, recordTypeId)) {
    return res.status(403).json({ error: `Record type "${recordTypeId}" is not assigned to this user for "${objectName}".` });
  }
  if (!recordActionEnabled(object, 'New', recordTypeId, profileIdForPrincipal(principal, tenant))) return res.status(403).json({ error: 'New is not enabled for this object, list view, or page layout' });
  try {
    const working = structuredClone(tenant);
    const cloneValues: Record<string, unknown> = {};
    if (cloneSource) {
      for (const field of object.fields) {
        if (['Id', 'OwnerId', 'CreatedDate', 'LastModifiedDate'].includes(field.apiName) || field.formula
          || field.dataType === 'AutoNumber' || field.dataType === 'Auto Number'
          || !Object.hasOwn(cloneSource, field.apiName)
          || !hasFieldPermission(principal, tenant, objectName, field.apiName, 'read')
          || !hasFieldPermission(principal, tenant, objectName, field.apiName, 'edit')) continue;
        cloneValues[field.apiName] = cloneSource[field.apiName];
      }
      if (recordTypeId) cloneValues.RecordTypeId = recordTypeId;
    }
    const sanitized = sanitizeRecordValues(object, { ...cloneValues, ...parsed.data });
    assertFieldEditPermissions(principal, tenant, object, sanitized);
    if (sanitized.OwnerId !== undefined && sanitized.OwnerId !== principal.userId) {
      const queue = typeof sanitized.OwnerId === 'string'
        ? tenant.accessControl.queues.find((item) => item.id === sanitized.OwnerId
          && item.supportedObjectApiNames.includes(objectName))
        : undefined;
      if (!queue || (!queueContainsUser(queue, principal.userId, tenant)
        && !hasObjectWidePermission(principal, tenant, objectName, 'modifyAll')
        && !principal.permissions.includes('security:manage'))) {
        return res.status(403).json({ error: 'Records can only be assigned to a queue you belong to or one you can manage' });
      }
    }
    const values = applyRecordDefaults(principal.tenantId, working, object, sanitized, principal.userId);
    validateRuntimeRecord(principal.tenantId, working, object, values);
    const now = new Date().toISOString();
    const isClone = cloneSource !== undefined;
    let record = calculateFormulaFields(object, stampRecordAuditFields({ ...values, Id: randomUUID(), CreatedDate: now, LastModifiedDate: now }, principal.userId, now), {
      ...formulaContextForUser(working, principal.userId), isClone
    });
    await runBeforeSaveRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'created', record, undefined, 0, isClone);
    const beforeSaveValues = normalizeFlowRecordAssignments(object, record, values);
    record = calculateFormulaFields(object, record, { ...formulaContextForUser(working, principal.userId), isClone });
    record = withCaseClosedDate(objectName, record);
    validateRuntimeRecord(principal.tenantId, working, object, { ...values, ...beforeSaveValues }, record);
    working.records[objectName] = [...(working.records[objectName] ?? []), record];
    await runRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'created', record, undefined, 0, isClone);
    const commitDenial = currentRecordCommitDenial(principal,objectName,'create',sanitized);
    if (commitDenial) return res.status(commitDenial.status).json({error:commitDenial.error});
    persistTenantRecords(principal.tenantId, working);
    // Do not acknowledge a record write before its transactional SQL commit.
    await waitForPersistedState();
    return res.status(201).json({ record: sanitizeRecordForRead(principal, working, object, working.records[objectName].find((item) => item.Id === record.Id) ?? record) });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Record creation failed' });
  }
});
app.post('/api/records/:objectName/import', accessAuthentication, async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (objectName === 'User') return res.status(403).json({ error: 'Users must be provisioned through the security workspace' });
  if (!hasObjectPermission(principal, tenant, objectName, 'create')) return res.status(403).json({ error: `Missing create permission for object "${objectName}"` });
  if (!object.listViewButtons?.includes('Import')) return res.status(403).json({ error: 'Import is not enabled for this object' });
  const parsed = z.object({ records: z.array(z.record(z.unknown())).min(1) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Import requires at least one record row', details: parsed.error.flatten() });
  const working = structuredClone(tenant);
  const created: RuntimeRecord[] = [];
  try {
    for (const [index, row] of parsed.data.records.entries()) {
      if (Object.hasOwn(row, 'OwnerId')) throw new Error(`Row ${index + 1}: OwnerId cannot be set during import.`);
      const values = sanitizeRecordValues(object, row);
      assertFieldEditPermissions(principal, tenant, object, values);
      const recordTypeId = typeof values.RecordTypeId === 'string' ? values.RecordTypeId : undefined;
      if (recordTypeId && !hasRecordTypeAccessForUser(principal.userId, tenant, objectName, recordTypeId)) {
        throw new Error(`Row ${index + 1}: Record type "${recordTypeId}" is not assigned to this user.`);
      }
      if (!recordActionEnabled(object, 'New', recordTypeId, profileIdForPrincipal(principal, tenant))) {
        throw new Error(`Row ${index + 1}: New is not enabled for this object, list view, or page layout.`);
      }
      const defaulted = applyRecordDefaults(principal.tenantId, working, object, values, principal.userId);
      validateRuntimeRecord(principal.tenantId, working, object, defaulted);
      const now = new Date().toISOString();
      let record = calculateFormulaFields(object, stampRecordAuditFields({ ...defaulted, Id: randomUUID(), CreatedDate: now, LastModifiedDate: now }, principal.userId, now), formulaContextForUser(working, principal.userId));
      await runBeforeSaveRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'created', record);
      const beforeSaveValues = normalizeFlowRecordAssignments(object, record, defaulted);
      record = calculateFormulaFields(object, record, formulaContextForUser(working, principal.userId));
      record = withCaseClosedDate(objectName, record);
      validateRuntimeRecord(principal.tenantId, working, object, { ...defaulted, ...beforeSaveValues }, record);
      working.records[objectName] = [...(working.records[objectName] ?? []), record];
      created.push(record);
    }
    for (const record of created) {
      await runRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'created', record);
    }
    persistTenantRecords(principal.tenantId, working);
    // Do not acknowledge a record write before its transactional SQL commit.
    await waitForPersistedState();
    const savedRecords = created.map((record) => working.records[objectName].find((item) => item.Id === record.Id) ?? record);
    return res.status(201).json({ records: savedRecords.map((record) => sanitizeRecordForRead(principal, working, object, record)), count: savedRecords.length });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Record import failed' });
  }
});
app.put('/api/records/:objectName/:recordId/owner', accessAuthentication, async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (objectName === 'User') return res.status(403).json({ error: 'Users must be managed through the security workspace' });
  if (!hasObjectPermission(principal, tenant, objectName, 'edit')) return res.status(403).json({ error: `Missing edit permission for object "${objectName}"` });
  if (!hasObjectWidePermission(principal, tenant, objectName, 'modifyAll') && !principal.permissions.includes('security:manage')) {
    return res.status(403).json({ error: 'Changing record ownership requires Modify All or security management access' });
  }
  const parsed = z.object({ ownerId: z.string().min(1) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'A valid ownerId is required' });
  const ownerField = object.fields.find((field) => field.apiName === 'OwnerId' && field.relationship?.targetObject === 'User');
  if (!ownerField) return res.status(400).json({ error: `Object "${objectName}" does not support record ownership` });
  if (!object.listViewButtons?.includes('Change Owner')) {
    return res.status(403).json({ error: 'Change Owner is not enabled for this object’s list views' });
  }
  const existing = (tenant.records[objectName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!existing || !hasRecordAccess(principal, tenant, objectName, existing, 'Edit')) return res.status(404).json({ error: 'Record was not found' });
  if (!recordUnmodified(req.get('If-Unmodified-Since'), existing)) return res.status(412).json({ error: 'Record changed since it was opened. Refresh and retry.' });
  if (!recordActionEnabled(object, 'Edit', typeof existing.RecordTypeId === 'string' ? existing.RecordTypeId : undefined, profileIdForPrincipal(principal, tenant))) {
    return res.status(403).json({ error: 'Edit is not enabled for this object or page layout' });
  }
  const owner = getState().users.find((user) => user.id === parsed.data.ownerId && user.tenantId === principal.tenantId && !user.disabled);
  const ownerQueue = tenant.accessControl.queues.find((queue) =>
    queue.id === parsed.data.ownerId && queue.supportedObjectApiNames.includes(objectName));
  if (!owner && !ownerQueue) return res.status(422).json({ error: 'The selected owner is not an active tenant user or eligible queue' });
  try {
    const working = structuredClone(tenant);
    const values = sanitizeRecordValues(object, { [ownerField.apiName]: parsed.data.ownerId });
    assertFieldEditPermissions(principal, tenant, object, values);
    const now = new Date().toISOString();
    let updated = calculateFormulaFields(object, stampRecordAuditFields({ ...existing, ...values, LastModifiedDate: now }, principal.userId, now, existing), formulaContextForUser(working, principal.userId));
    await runBeforeSaveRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'updated', updated, existing);
    const beforeSaveValues = normalizeFlowRecordAssignments(object, updated, existing);
    updated = calculateFormulaFields(object, updated, formulaContextForUser(working, principal.userId));
    updated = withCaseClosedDate(objectName, updated, existing);
    validateRuntimeRecord(principal.tenantId, working, object, { ...values, ...beforeSaveValues }, updated);
    appendFieldHistory(working, object, existing, updated, principal.userId);
    working.records[objectName] = (working.records[objectName] ?? []).map((item) => item.Id === existing.Id ? updated : item);
    if (objectName === 'Connector_App__c') disableOnConnectorUninstall(working, existing, updated);
    await runRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'updated', updated, existing);
    const commitDenial = currentRecordCommitDenial(principal,objectName,'edit',values,existing);
    if (commitDenial) return res.status(commitDenial.status).json({error:commitDenial.error});
    persistTenantRecords(principal.tenantId, working);
    // Do not acknowledge a record write before its transactional SQL commit.
    await waitForPersistedState();
    return res.json({ record: sanitizeRecordForRead(principal, working, object, working.records[objectName].find((item) => item.Id === existing.Id) ?? updated) });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Record ownership change failed' });
  }
});
app.put('/api/records/:objectName/:recordId', accessAuthentication, async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (objectName === 'ConnectorProvider__c' || objectName === 'IntegrationConnection__c') {
    return res.status(403).json({ error: 'Manage connector definitions and Integration Connections in Une Connectors Setup' });
  }
  if (objectName === 'User') return res.status(403).json({ error: 'Users must be managed through the security workspace' });
  if (!hasObjectPermission(principal, tenant, objectName, 'edit')) return res.status(403).json({ error: `Missing edit permission for object "${objectName}"` });
  const parsed = z.record(z.unknown()).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Record values must be an object' });
  if (req.get('X-MetaDrive-Offline-Sync') === '1') {
    if (!req.get('If-Unmodified-Since'))
      return res.status(412).json({error:'Offline edits require the original record revision to prevent overwriting changes.'});
    const knownFields = new Set(object.fields.map(field => field.apiName));
    if (Object.keys(parsed.data).some(key => key !== 'RecordTypeId' && !knownFields.has(key)))
      return res.status(412).json({error:'Record schema changed while offline. Review your draft before retrying.'});
  }
  const existing = (tenant.records[objectName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!existing || !hasRecordAccess(principal, tenant, objectName, existing, 'Edit')) return res.status(404).json({ error: 'Record was not found' });
  if (!recordUnmodified(req.get('If-Unmodified-Since'), existing)) return res.status(412).json({ error: 'Record changed since it was opened. Refresh and retry.' });
  if (Object.hasOwn(parsed.data, 'OwnerId')) {
    if (parsed.data.OwnerId !== existing.OwnerId) {
      return res.status(403).json({ error: 'OwnerId cannot be changed through record updates; use a dedicated ownership operation to transfer ownership' });
    }
    // Older clients include the unchanged owner in generic edit payloads.
    // Ignore it without permitting ownership transfers through this endpoint.
    delete parsed.data.OwnerId;
  }
  if (!recordActionEnabled(object, 'Edit', typeof existing.RecordTypeId === 'string' ? existing.RecordTypeId : undefined, profileIdForPrincipal(principal, tenant))) {
    return res.status(403).json({ error: 'Edit is not enabled for this object or page layout' });
  }
  if (typeof parsed.data.RecordTypeId === 'string'
    && parsed.data.RecordTypeId !== existing.RecordTypeId
    && !hasRecordTypeAccessForUser(principal.userId, tenant, objectName, parsed.data.RecordTypeId)) {
    return res.status(403).json({ error: `Record type "${parsed.data.RecordTypeId}" is not assigned to this user for "${objectName}".` });
  }
  try {
    const working = structuredClone(tenant);
    const values = sanitizeRecordValues(object, parsed.data);
    assertFieldEditPermissions(principal, tenant, object, values);
    if (object.fields.some((field) => field.dataType === 'AutoNumber' || field.dataType === 'Auto Number')) {
      for (const field of object.fields.filter((item) => item.dataType === 'AutoNumber' || item.dataType === 'Auto Number')) {
        if (Object.hasOwn(values, field.apiName)) throw new Error(`Auto-number field "${field.apiName}" cannot be changed.`);
      }
    }
    const now = new Date().toISOString();
    if (objectName === 'Connector_App__c') assertConnectorLifecycleAccess(existing, { ...existing, ...values }, principal);
    const nextRecord = objectName === 'Connector_App__c'
      ? applyConnectorLifecycle(existing, { ...existing, ...values }, tenant.namedCredentials, tenant.flows,
          new Date(now), principal.permissions.includes('licence:manage'))
      : { ...existing, ...values };
    let updated = calculateFormulaFields(object, stampRecordAuditFields({ ...nextRecord, LastModifiedDate: now }, principal.userId, now, existing), formulaContextForUser(working, principal.userId));
    await runBeforeSaveRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'updated', updated, existing);
    const beforeSaveValues = normalizeFlowRecordAssignments(object, updated, existing);
    updated = calculateFormulaFields(object, updated, formulaContextForUser(working, principal.userId));
    validateRelationshipReparenting(object, existing, updated);
    validateRuntimeRecord(principal.tenantId, working, object, { ...values, ...beforeSaveValues }, updated);
    appendFieldHistory(working, object, existing, updated, principal.userId);
    working.records[objectName] = (working.records[objectName] ?? []).map((item) => item.Id === existing.Id ? updated : item);
    await runRecordTriggeredFlows(principal.tenantId, working, principal.userId, objectName, 'updated', updated, existing);
    // A queued offline edit may arrive after an administrator revoked access.
    // Recheck current server-side object, field, record and record-type grants
    // AFTER asynchronous Flows and BEFORE any state/SQL mutation is queued.
    const commitDenial = currentRecordCommitDenial(principal, objectName, 'edit', values, existing);
    if (commitDenial) return res.status(commitDenial.status).json({ error: commitDenial.error });
    persistTenantRecords(principal.tenantId, working);
    // Do not acknowledge a record write before its transactional SQL commit.
    await waitForPersistedState();
    return res.json({ record: sanitizeRecordForRead(principal, working, object, working.records[objectName].find((item) => item.Id === existing.Id) ?? updated) });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Record update failed' });
  }
});
// Ownership changes are only permitted through this dedicated, auditable route.
// Generic record PUT must never become an ownership-escalation shortcut.
app.post('/api/records/:objectName/:recordId/transfer-owner', accessAuthentication, async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const recordId = routeParam(req, 'recordId');
  const request = z.object({ ownerId: z.string().min(1) }).strict().safeParse(req.body);
  if (!request.success) return res.status(400).json({ error: 'A valid new owner ID is required' });
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object || !object.fields.some((field) => field.apiName === 'OwnerId')
    || ['User', 'Connector_App__c', 'ConnectorProvider__c', 'IntegrationConnection__c'].includes(objectName))
    return res.status(404).json({ error: 'Object does not support ownership transfer' });
  const existing = (tenant.records[objectName] ?? []).find((item) => item.Id === recordId);
  if (!existing || !hasRecordAccess(principal, tenant, objectName, existing, 'Edit'))
    return res.status(404).json({ error: 'Record was not found' });
  const currentQueueMember = tenant.accessControl.queues.some((queue) =>
    queue.id === existing.OwnerId && queue.supportedObjectApiNames.includes(objectName)
    && queueContainsUser(queue, principal.userId, tenant));
  if (existing.OwnerId !== principal.userId && !currentQueueMember
    && !hasObjectWidePermission(principal, tenant, objectName, 'modifyAll')
    && !principal.permissions.includes('security:manage'))
    return res.status(403).json({ error: 'Only the owner or authorized administrator may transfer ownership' });
  if (!hasFieldPermission(principal, tenant, objectName, 'OwnerId', 'edit'))
    return res.status(403).json({ error: 'Missing OwnerId edit permission' });
  const ownerId = request.data.ownerId;
  const targetUser = getState().users.find((user) => user.id === ownerId
    && user.tenantId === principal.tenantId && !user.disabled);
  const targetQueue = tenant.accessControl.queues.find((queue) =>
    queue.id === ownerId && queue.supportedObjectApiNames.includes(objectName));
  if (!targetUser && !targetQueue) return res.status(400).json({ error: 'New owner must be an active tenant user or supported queue' });
  if (targetQueue && !queueContainsUser(targetQueue, principal.userId, tenant)
    && !principal.permissions.includes('security:manage'))
    return res.status(403).json({ error: 'Queue membership or security administration is required' });
  if (existing.OwnerId === ownerId) return res.json({ record: sanitizeRecordForRead(principal, tenant, object, existing) });
  try {
    const working = structuredClone(tenant);
    const now = new Date().toISOString();
    const updated = calculateFormulaFields(object,
      stampRecordAuditFields({ ...existing, OwnerId: ownerId, LastModifiedDate: now }, principal.userId, now, existing),
      formulaContextForUser(working, principal.userId));
    validateRuntimeRecord(principal.tenantId, working, object, { OwnerId: ownerId }, updated);
    appendFieldHistory(working, object, existing, updated, principal.userId);
    working.records[objectName] = (working.records[objectName] ?? [])
      .map((item) => item.Id === recordId ? updated : item);
    // Manual shares are not carried over when ownership changes. Sharing rules,
    // queue membership and role hierarchy are evaluated against the new owner.
    working.recordShares = working.recordShares.filter((share) =>
      share.objectApiName !== objectName || share.recordId !== recordId);
    persistTenantRecords(principal.tenantId, withSecurityEvent(working, principal.userId,
      'rbac.record-ownership.transferred', { objectName, recordId, newOwnerId: ownerId }));
    return res.json({ record: sanitizeRecordForRead(principal, working, object, updated) });
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Owner transfer failed' });
  }
});

app.delete('/api/records/:objectName/:recordId', accessAuthentication, async (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const objectName = routeParam(req, 'objectName');
  const object = tenant.objects.find((item) => item.apiName === objectName);
  if (!object) return res.status(404).json({ error: `Object "${objectName}" was not found` });
  if (objectName === 'ConnectorProvider__c' || objectName === 'IntegrationConnection__c') {
    return res.status(403).json({ error: 'Manage connector definitions and Integration Connections in Une Connectors Setup' });
  }
  if (objectName === 'User') return res.status(403).json({ error: 'Users must be managed through the security workspace' });
  if (objectName === 'Connector_App__c' && !principal.permissions.includes('licence:manage')) {
    return res.status(403).json({error:'Connector app catalogue creation/deletion requires platform licence permission.'});
  }
  if (!hasObjectPermission(principal, tenant, objectName, 'delete')) return res.status(403).json({ error: `Missing delete permission for object "${objectName}"` });
  const existing = (tenant.records[objectName] ?? []).find((item) => item.Id === routeParam(req, 'recordId'));
  if (!existing || !hasRecordAccess(principal, tenant, objectName, existing, 'Delete')) return res.status(404).json({ error: 'Record was not found' });
  if (!recordUnmodified(req.get('If-Unmodified-Since'), existing)) return res.status(412).json({ error: 'Record changed since it was opened. Refresh and retry.' });
  if (!recordActionEnabled(object, 'Delete', typeof existing.RecordTypeId === 'string' ? existing.RecordTypeId : undefined, profileIdForPrincipal(principal, tenant))) {
    return res.status(403).json({ error: 'Delete is not enabled for this object or page layout' });
  }
  try {
    const working = structuredClone(tenant);
    await deleteRecordCascade(principal.tenantId, working, principal.userId, objectName, existing);
    persistTenantRecords(principal.tenantId, working);
    // Do not acknowledge a record write before its transactional SQL commit.
    await waitForPersistedState();
    return res.status(204).end();
  } catch (error) {
    return res.status(422).json({ error: error instanceof Error ? error.message : 'Record deletion failed' });
  }
});
}
