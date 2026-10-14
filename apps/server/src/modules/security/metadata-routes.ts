import { z } from 'zod';
import type { Express, Request, Response, RequestHandler } from 'express';
import type { Principal } from '../../auth.js';
import type { TenantData, LocalUser, PlatformState } from '../../index.js';

type AccessControl = TenantData['accessControl'];
type Role = AccessControl['roles'][number];
type Parsed<T> = { success: true; data: T } | { success: false; error: { flatten: () => unknown } };
type Schema<T> = { safeParse: (value: unknown) => Parsed<T> };

export function registerSecurityMetadataRoutes(deps: {
  app: Express;
  requirePermission: (name: string) => RequestHandler;
  tenantData: (id: string) => TenantData | undefined;
  getPrincipal: (res: Response) => Principal;
  getState: () => PlatformState;
  setState: (next: PlatformState) => void;
  accessControlSchema: Schema<AccessControl>;
  roleSchema: Schema<Role>;
  sharingSettingSchema: z.ZodType<TenantData['sharingSettings'][string]>;
  validateAdvancedSharingMetadata: (...args: any[]) => any;
  profileIdForRole: (role: string, profiles: AccessControl['profiles']) => string;
  withSecurityEvent: (tenant: TenantData, actor: string, action: string) => TenantData;
  effectivePermissions: (user: LocalUser, tenant: TenantData) => string[];
  persistState: (next: PlatformState) => void;
  persistTenantRecords: (tenantId: string, tenant: TenantData) => void;
  roleApiNameForName: (name: string) => string;
  routeParam: (req: Request, name: string) => string;
}) {
  const { app, requirePermission, tenantData, getPrincipal, getState, setState,
    accessControlSchema, roleSchema, sharingSettingSchema, validateAdvancedSharingMetadata, profileIdForRole,
    withSecurityEvent, effectivePermissions, persistState, persistTenantRecords,
    roleApiNameForName, routeParam } = deps;
app.get('/api/metadata/permissions', requirePermission('security:read'), (_req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId);
  res.json(tenant
    ? { ...tenant.accessControl, sharingSettings: tenant.sharingSettings, tenantId: getPrincipal(res).tenantId }
    : { profiles: [], permissionSets: [], permissionSetGroups: [], roles: [], publicGroups: [], sharingRules: [], users: [], sharingSettings: {} });
});
app.put('/api/metadata/permissions', requirePermission('security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? {
      ...req.body,
      roles: req.body.roles ?? tenant.accessControl.roles,
      publicGroups: req.body.publicGroups ?? tenant.accessControl.publicGroups,
      queues: req.body.queues ?? tenant.accessControl.queues,
      sharingRules: req.body.sharingRules ?? tenant.accessControl.sharingRules
    }
    : req.body;
  const parsed = accessControlSchema.safeParse(body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid access-control metadata', details: parsed.error.flatten() });
  const appNames = new Set(tenant.apps.map((app) => app.apiName));
  const tabNames = new Set(tenant.objects.map((object) => object.apiName));
  const invalidNavigation = [...parsed.data.profiles, ...parsed.data.permissionSets].some((item) =>
    Object.keys(item.appPermissions ?? {}).some((name) => !appNames.has(name))
      || Object.keys(item.tabPermissions ?? {}).some((name) => !tabNames.has(name)))
    || parsed.data.permissionSetGroups.some((group) =>
      Object.keys(group.mutedAppPermissions ?? {}).some((name) => !appNames.has(name))
      || Object.keys(group.mutedTabPermissions ?? {}).some((name) => !tabNames.has(name)));
  if (invalidNavigation) return res.status(400).json({ error: 'Navigation grants must reference apps and tabs in this tenant' });
  // Fail closed: tenant RBAC is deliberately not an authority for platform policies.
  const reservedPermission = (permission: string) =>
    permission === 'licence:manage' || permission.startsWith('platform:');
  if (parsed.data.profiles.some((profile) => profile.systemPermissions.some(reservedPermission))
    || parsed.data.permissionSets.some((set) => set.systemPermissions.some(reservedPermission))
    || parsed.data.permissionSetGroups.some((group) => group.mutedSystemPermissions.some(reservedPermission))) {
    return res.status(403).json({ error: 'Platform policies cannot be assigned through tenant RBAC.' });
  }
  const unavailableUserCurrency = parsed.data.users.find((user) =>
    user.currencyIsoCode && !tenant.currencySettings.currencies.some((currency) => currency.currencyIsoCode === user.currencyIsoCode));
  if (unavailableUserCurrency) {
    return res.status(400).json({
      error: `User "${unavailableUserCurrency.username}" must use an active tenant currency`
    });
  }
  if (parsed.data.users.some((user) => !user.roleId)) {
    return res.status(400).json({ error: 'Every tenant user must be assigned to a role' });
  }
  const invalidExternalUser = parsed.data.users.find((member) =>
    member.userType === 'external' &&
    (!member.externalAccountId ||
      !(tenant.records.Account ?? []).some((record) => record.Id === member.externalAccountId)));
  if (invalidExternalUser)
    return res.status(400).json({ error: 'External identity requires a tenant-local account boundary' });
  const identitiesByEmail = new Map(getState().users
    .filter((user) => user.tenantId === principal.tenantId)
    .map((user) => [user.email.trim().toLowerCase(), user.id]));
  if (parsed.data.users.some((user) => identitiesByEmail.get(user.username.trim().toLowerCase()) !== user.id)) {
    return res.status(400).json({ error: 'Each access-control email must match that user’s tenant identity' });
  }
  const requestedSharingSettings = z.record(sharingSettingSchema).safeParse(req.body?.sharingSettings ?? tenant.sharingSettings);
  if (!requestedSharingSettings.success) {
    return res.status(400).json({ error: 'Invalid sharing settings', details: requestedSharingSettings.error.flatten() });
  }
  const unknownSharingObject = Object.keys(requestedSharingSettings.data)
    .find((objectName) => !tenant.objects.some((object) => object.apiName === objectName));
  if (unknownSharingObject) return res.status(400).json({ error: `Sharing settings reference unknown object "${unknownSharingObject}"` });
  const sharingSettings = Object.fromEntries(tenant.objects.map((object) => [
    object.apiName,
    requestedSharingSettings.data[object.apiName] ?? tenant.sharingSettings[object.apiName] ?? {
      defaultAccess: 'Private' as const, grantAccessUsingHierarchies: true
    }
  ]));
  try {
    for (const [objectName, setting] of Object.entries(sharingSettings)) {
      const object = tenant.objects.find((entry) => entry.apiName === objectName);
      if (!object) throw new Error('Sharing references an unknown object');
      validateAdvancedSharingMetadata({
        tenantId: principal.tenantId, objectApiName: objectName,
        rules: setting.restrictionRules ?? []
      });
      for (const rule of setting.restrictionRules ?? []) {
        if (rule.subjectType === 'user' &&
          !parsed.data.users.some((user) => user.id === rule.subjectId))
          throw new Error('Restriction references unknown tenant user');
        if (rule.subjectType === 'role' &&
          !parsed.data.roles.some((role) => role.id === rule.subjectId))
          throw new Error('Restriction references unknown tenant role');
        if (rule.conditions.some((criterion) =>
          criterion.field !== 'Id' && !object.fields.some((field) => field.apiName === criterion.field)))
          throw new Error('Restriction references unknown object field');
      }
      if (setting.portalEnabled && setting.portalAccountField !== 'Id' &&
        !object.fields.some((field) =>
          field.apiName === (setting.portalAccountField ?? 'AccountId')))
        throw new Error('Portal account boundary must reference an existing object field');
    }
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid advanced sharing metadata' });
  }
  const tenantUsers = getState().users.filter((user) => user.tenantId === principal.tenantId);
  const usersById = new Map(tenantUsers.map((user) => [user.id, user]));
  if (parsed.data.users.some((user) => !usersById.has(user.id))) {
    return res.status(400).json({ error: 'User membership must be provisioned through the identity service' });
  }
  if (parsed.data.users.length !== tenantUsers.length) {
    return res.status(400).json({ error: 'Access-control updates must include every tenant user' });
  }
  const removedSharedGroup = tenant.dashboards.find((dashboard) =>
    dashboard.sharedPermissionSetGroupIds.some((groupId) =>
      !parsed.data.permissionSetGroups.some((group) => group.id === groupId)));
  if (removedSharedGroup) {
    return res.status(409).json({ error: `Permission set group access is still assigned to dashboard "${removedSharedGroup.label}"` });
  }
  const danglingFolderShare = tenant.dashboardFolders.flatMap((folder) =>
    folder.shares.map((share) => ({ folder, share }))).find(({ share }) =>
    share.targetType === 'User'
      ? !parsed.data.users.some((user) => user.id === share.targetId)
      : share.targetType === 'PublicGroup'
        ? !parsed.data.publicGroups.some((group) => group.id === share.targetId)
        : share.targetType === 'PermissionSetGroup'
          ? !parsed.data.permissionSetGroups.some((group) => group.id === share.targetId)
          : share.targetType === 'Territory'
            ? !(tenant.dashboardTerritories ?? []).some((territory) => territory.id === share.targetId)
            : !parsed.data.roles.some((role) => role.id === share.targetId));
  if (danglingFolderShare) {
    return res.status(409).json({
      error: `Folder "${danglingFolderShare.folder.label}" still grants access to the removed ${danglingFolderShare.share.targetType} "${danglingFolderShare.share.targetId}"`
    });
  }
  const removedPublicGroup = tenant.accessControl.publicGroups.find((group) =>
    tenant.recordShares.some((share) => share.groupId === group.id && !parsed.data.publicGroups.some((item) => item.id === group.id))
    || tenant.accessControl.publicGroups.some((item) => item.groupIds.includes(group.id)
      && !parsed.data.publicGroups.some((candidate) => candidate.id === group.id)));
  if (removedPublicGroup) {
    return res.status(409).json({ error: `Public group "${removedPublicGroup.label}" is still referenced by a share or another group` });
  }
  const profilesById = new Map(parsed.data.profiles.map((profile) => [profile.id, profile]));
  const standardProfileIds = tenant.accessControl.profiles.filter((profile) => profile.isStandard).map((profile) => profile.id);
  if (standardProfileIds.some((id) => !profilesById.has(id))) {
    return res.status(409).json({ error: 'Standard profiles cannot be deleted' });
  }
  if (tenant.accessControl.profiles.some((profile) => profile.isStandard
    && profilesById.get(profile.id)?.isStandard !== true)) {
    return res.status(409).json({ error: 'A standard profile cannot be changed into a custom profile' });
  }
  const removedAssignedProfile = tenant.objects.find((object) =>
    object.pageLayoutAssignments?.some((assignment) => assignment.profileId !== '*' && !profilesById.has(assignment.profileId))
    || object.compactLayoutAssignments?.some((assignment) => assignment.profileId !== '*' && !profilesById.has(assignment.profileId)));
  if (removedAssignedProfile) {
    return res.status(409).json({ error: `Page or compact layout assignments must be removed from "${removedAssignedProfile.label}" before deleting a profile` });
  }
  const fieldExists = (key: string) => {
    const [objectName, fieldName, ...extra] = key.split('.');
    return extra.length === 0 && Boolean(tenant.objects.find((object) => object.apiName === objectName)
      ?.fields.some((field) => field.apiName === fieldName));
  };
  const invalidFieldPermission = [
    ...parsed.data.profiles.flatMap((profile) => Object.keys(profile.fieldPermissions)),
    ...parsed.data.permissionSets.flatMap((set) => Object.keys(set.fieldPermissions)),
    ...parsed.data.permissionSetGroups.flatMap((group) => Object.keys(group.mutedFieldPermissions))
  ].find((key) => !fieldExists(key));
  if (invalidFieldPermission) return res.status(400).json({ error: `Field permission references unknown field "${invalidFieldPermission}"` });
  const invalidObjectPermission = [
    ...parsed.data.profiles.flatMap((profile) => Object.keys(profile.objectPermissions)),
    ...parsed.data.permissionSets.flatMap((set) => Object.keys(set.objectPermissions)),
    ...parsed.data.permissionSetGroups.flatMap((group) => Object.keys(group.mutedObjectPermissions))
  ].find((name) => !tenant.objects.some((object) => object.apiName === name));
  if (invalidObjectPermission) return res.status(400).json({ error: `Permission references unknown object "${invalidObjectPermission}"` });
  const invalidRecordTypePermission = [
    ...parsed.data.profiles.flatMap((profile) => Object.keys(profile.recordTypePermissions)),
    ...parsed.data.permissionSets.flatMap((set) => Object.keys(set.recordTypePermissions)),
    ...parsed.data.permissionSetGroups.flatMap((group) => Object.keys(group.mutedRecordTypePermissions))
  ].find((key) => {
    const separator = key.indexOf('.');
    if (separator < 1) return true;
    const objectName = key.slice(0, separator);
    const recordTypeId = key.slice(separator + 1);
    return !tenant.objects.find((object) => object.apiName === objectName)
      ?.recordTypes?.some((recordType) => recordType.id === recordTypeId && recordType.active);
  });
  if (invalidRecordTypePermission) {
    return res.status(400).json({ error: `Permission references unknown or inactive record type "${invalidRecordTypePermission}"` });
  }
  const tenantUserIds = new Set(tenantUsers.filter((user) => !user.disabled).map((user) => user.id));
  const invalidPublicGroupUser = parsed.data.publicGroups.find((group) =>
    group.userIds.some((userId) => !tenantUserIds.has(userId)));
  if (invalidPublicGroupUser) {
    return res.status(400).json({ error: `Public group "${invalidPublicGroupUser.label}" can only contain active users in this tenant` });
  }
  const invalidQueue = parsed.data.queues.find((queue) =>
    queue.userIds.some((userId) => !tenantUserIds.has(userId))
    || queue.supportedObjectApiNames.some((objectApiName) => {
      const object = tenant.objects.find((item) => item.apiName === objectApiName);
      return !object || !object.fields.some((field) => field.apiName === 'OwnerId'
        && field.relationship?.targetObject === 'User');
    }));
  if (invalidQueue) {
    return res.status(400).json({ error: `Queue "${invalidQueue.label}" must reference active tenant users and owner-enabled objects` });
  }
  const removedAssignedQueue = tenant.accessControl.queues.find((queue) =>
    !parsed.data.queues.some((item) => item.id === queue.id)
    && Object.entries(tenant.records).some(([objectName, records]) =>
      queue.supportedObjectApiNames.includes(objectName)
      && records.some((record) => record.OwnerId === queue.id)));
  if (removedAssignedQueue) {
    return res.status(409).json({ error: `Queue "${removedAssignedQueue.label}" still owns records` });
  }
  const invalidRule = parsed.data.sharingRules.find((rule) => {
    const object = tenant.objects.find((item) => item.apiName === rule.objectApiName);
    if (!object) return true;
    if (rule.type === 'CriteriaBased') {
      for (const criterion of rule.criteria) {
        const field = object.fields.find((item) => item.apiName === criterion.fieldApiName);
        if (!field) return true;
        const numericField = /^(Number|Currency|Percent)(\(|$)/.test(field.dataType);
        const textField = /^(Text|Email|Phone|URL|Picklist)(\(|$)/.test(field.dataType);
        if (['Greater Than', 'Less Than'].includes(criterion.operator) && !numericField) return true;
        if (['Contains', 'Starts With'].includes(criterion.operator) && !textField) return true;
      }
    }
    if (rule.targetType === 'User' && !tenantUserIds.has(rule.targetId)) return true;
    return false;
  });
  if (invalidRule) {
    return res.status(400).json({ error: `Sharing rule "${invalidRule.label}" references an unknown object, field, target user, or incompatible field operator` });
  }
  for (const user of parsed.data.users) {
    const profile = user.profileId ? profilesById.get(user.profileId) : undefined;
    const effectiveProfile = profile ?? profilesById.get(profileIdForRole(user.role, parsed.data.profiles));
    if (!effectiveProfile) return res.status(400).json({ error: `User "${user.username}" must be assigned a profile` });
    const assignedSets = parsed.data.permissionSets.filter((set) => user.permissionSetIds.includes(set.id));
    const assignedGroups = parsed.data.permissionSetGroups.filter((group) => user.permissionSetGroupIds.includes(group.id));
    const incompatibleSet = assignedSets.find((set) => set.license !== effectiveProfile.license)
      ?? assignedGroups.flatMap((group) => group.permissionSetIds
        .map((setId) => parsed.data.permissionSets.find((set) => set.id === setId))
        .filter((set): set is typeof parsed.data.permissionSets[number] => Boolean(set)))
        .find((set) => set.license !== effectiveProfile.license);
    if (incompatibleSet) {
      return res.status(400).json({ error: `Permission set "${incompatibleSet.label}" is not compatible with ${effectiveProfile.license} profile "${effectiveProfile.label}"` });
    }
  }
  const normalizedAccessControl: AccessControl = {
    ...parsed.data,
    permissionSetGroups: parsed.data.permissionSetGroups.map((group) => ({
      ...group,
      calculationStatus: 'Updated',
      lastCalculatedAt: new Date().toISOString()
    })),
    users: parsed.data.users.map((user) => ({
      ...user,
      role: parsed.data.roles.find((role) => role.id === user.roleId)!.name
    }))
  };
  const userAssignments = new Map(normalizedAccessControl.users.map((user) => [user.id, user]));
  const updatedUsers = getState().users.map((user) => {
    if (user.tenantId !== principal.tenantId) return user;
    const assignment = userAssignments.get(user.id);
    const assignedRole = assignment?.roleId
      ? parsed.data.roles.find((role) => role.id === assignment.roleId)
      : undefined;
    return assignment ? {
      ...user,
      ...(assignedRole ? { role: assignedRole.name } : {}),
      permissionSetIds: assignment.permissionSetIds,
      permissionSetGroupIds: assignment.permissionSetGroupIds
    } : user;
  });
  const updatedTenant = withSecurityEvent(
    { ...tenant, accessControl: normalizedAccessControl, sharingSettings },
    principal.userId, 'rbac.permissions.updated'
  );
  const hasActiveSecurityAdministrator = updatedUsers.some((user) =>
    user.tenantId === principal.tenantId && !user.disabled
    && effectivePermissions(user, updatedTenant).includes('security:manage'));
  if (!hasActiveSecurityAdministrator) {
    return res.status(409).json({ error: 'At least one active tenant user must retain the security:manage permission' });
  }
  const nextState = { ...getState(), users: updatedUsers, tenants: { ...getState().tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  setState(nextState);
  return res.json({ ...normalizedAccessControl, sharingSettings });
});
app.get('/api/metadata/roles', requirePermission('security:read'), (_req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId)!;
  return res.json({ roles: tenant.accessControl.roles });
});
app.post('/api/metadata/roles', requirePermission('security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const input = roleSchema.safeParse(req.body);
  if (!input.success) return res.status(400).json({ error: 'Invalid role metadata', details: input.error.flatten() });
  const role = {
    ...input.data,
    apiName: input.data.apiName ?? roleApiNameForName(input.data.name)
  };
  const roles = [...tenant.accessControl.roles, role];
  const validation = accessControlSchema.safeParse({ ...tenant.accessControl, roles });
  if (!validation.success) return res.status(400).json({ error: 'Invalid role hierarchy', details: validation.error.flatten() });
  persistTenantRecords(principal.tenantId, {
    ...tenant, accessControl: { ...tenant.accessControl, roles }
  });
  return res.status(201).json({ role });
});
app.put('/api/metadata/roles/:roleId', requirePermission('security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const roleId = routeParam(req, 'roleId');
  const existing = tenant.accessControl.roles.find((role) => role.id === roleId);
  if (!existing) return res.status(404).json({ error: 'Role was not found' });
  const parsed = roleSchema.safeParse({ ...req.body, id: roleId });
  if (!parsed.success) return res.status(400).json({ error: 'Invalid role metadata', details: parsed.error.flatten() });
  const nextRole = {
    ...parsed.data,
    apiName: parsed.data.apiName ?? existing.apiName ?? roleApiNameForName(parsed.data.name)
  };
  const roles = tenant.accessControl.roles.map((role) => role.id === roleId ? nextRole : role);
  const validation = accessControlSchema.safeParse({ ...tenant.accessControl, roles });
  if (!validation.success) return res.status(400).json({ error: 'Invalid role hierarchy', details: validation.error.flatten() });
  const updatedTenant = { ...tenant, accessControl: { ...tenant.accessControl, roles } };
  const updatedUsers = getState().users.map((user) => user.tenantId === principal.tenantId
    && tenant.accessControl.users.some((assignment) => assignment.id === user.id && assignment.roleId === roleId)
    ? { ...user, role: nextRole.name }
    : user);
  const nextState = { ...getState(), users: updatedUsers, tenants: { ...getState().tenants, [principal.tenantId]: updatedTenant } };
  persistState(nextState);
  setState(nextState);
  return res.json({ role: nextRole });
});
app.delete('/api/metadata/roles/:roleId', requirePermission('security:manage'), (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const tenant = tenantData(principal.tenantId)!;
  const roleId = routeParam(req, 'roleId');
  if (!tenant.accessControl.roles.some((role) => role.id === roleId)) return res.status(404).json({ error: 'Role was not found' });
  if (tenant.accessControl.roles.length <= 1) return res.status(409).json({ error: 'At least one role must remain in the tenant' });
  if (tenant.accessControl.roles.some((role) => role.parentRoleId === roleId)) {
    return res.status(409).json({ error: 'A role with child roles cannot be deleted' });
  }
  if (tenant.accessControl.users.some((user) => user.roleId === roleId)) {
    return res.status(409).json({ error: 'A role assigned to a user cannot be deleted' });
  }
  if (tenant.accessControl.publicGroups.some((group) =>
    group.roleIds.includes(roleId) || group.roleAndSubordinateIds.includes(roleId))
    || tenant.accessControl.sharingRules.some((rule) =>
      rule.ownerRoleIds.includes(roleId)
      || (['Role', 'RoleAndSubordinates'].includes(rule.targetType) && rule.targetId === roleId))
    || tenant.dashboardFolders.some((folder) => folder.shares.some((share) =>
      ['Role', 'RoleAndSubordinates'].includes(share.targetType) && share.targetId === roleId))) {
    return res.status(409).json({ error: 'A role referenced by a public group or sharing rule cannot be deleted' });
  }
  const roles = tenant.accessControl.roles.filter((role) => role.id !== roleId);
  const updatedTenant = { ...tenant, accessControl: { ...tenant.accessControl, roles } };
  persistTenantRecords(principal.tenantId, updatedTenant);
  return res.status(204).end();
});
}
