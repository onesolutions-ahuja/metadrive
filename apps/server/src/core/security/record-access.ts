import type { Principal } from '../../auth.js';
import type { LocalUser, TenantData } from '../state/types.js';
import type { ObjectMetadata, RuntimeRecord } from '../../index.js';
import type { ObjectPermission } from './access-control-schema.js';
import { roleIdForName, profileIdForRole } from '../../modules/security/role-helpers.js';
import { grantedObjectPermission, lockedRecordWriteAllowed, assertRecordFieldPermissions } from '../../record-write-policy.js';
import { communicationObjectApiName } from '../../communication-unification.js';
import { canAccessChatterRecord, isWhatsAppMessage } from '../../chatter-authorisation.js';
import { decideAdvancedRecordAccess, resolveAdvancedRecordGrant } from '../../advanced-sharing-policy.mjs';

/** OneEngine: tenant-scoped Object, Field, Record and sharing permission enforcement. */
export function createCoreRecordAccess(deps: { principalUser: (principal: Principal) => LocalUser | undefined }) {
 const { principalUser } = deps;
type AuthGrantContext = {
  profile?: TenantData['accessControl']['profiles'][number];
  directSets: TenantData['accessControl']['permissionSets'];
  groups: Array<{
    group: TenantData['accessControl']['permissionSetGroups'][number];
    sets: TenantData['accessControl']['permissionSets'];
  }>;
};
const requestGrantCache = new WeakMap<Principal, WeakMap<TenantData, AuthGrantContext>>();
function authorizationGrants(principal: Principal, tenant: TenantData): AuthGrantContext | undefined {
  let tenantCache = requestGrantCache.get(principal);
  if (tenantCache?.has(tenant)) return tenantCache.get(tenant);
  const user = principalUser(principal);
  if (!user) return undefined;
  const accessUser = tenant.accessControl.users.find((item) => item.id === user.id);
  const profiles = tenant.accessControl.profiles;
  const profile = profiles.find((item) => item.id ===
    (accessUser?.profileId ?? profileIdForRole(user.role, profiles)));
  const assignedSets = new Set(accessUser?.permissionSetIds ?? user.permissionSetIds);
  const directSets = tenant.accessControl.permissionSets.filter((set) => assignedSets.has(set.id));
  const groupIds = new Set(accessUser?.permissionSetGroupIds ?? user.permissionSetGroupIds);
  const groups = tenant.accessControl.permissionSetGroups
    .filter((group) => groupIds.has(group.id))
    .map((group) => ({
      group,
      sets: tenant.accessControl.permissionSets.filter((set) => group.permissionSetIds.includes(set.id))
    }));
  const resolved: AuthGrantContext = { profile, directSets, groups };
  if (!tenantCache) {
    tenantCache = new WeakMap();
    requestGrantCache.set(principal, tenantCache);
  }
  tenantCache.set(tenant, resolved);
  return resolved;
}
// Profile defaults preserve legacy tenant navigation. Explicit false hides an app/tab.
// Permission set grants are additive; group muting masks only that group's grant.
function canNavigate(principal: Principal, tenant: TenantData, type: 'app' | 'tab', key: string): boolean {
  const grants = authorizationGrants(principal, tenant);
  if (!grants) return false;
  const field = type === 'app' ? 'appPermissions' : 'tabPermissions';
  const mutedField = type === 'app' ? 'mutedAppPermissions' : 'mutedTabPermissions';
  const setting = grants.profile?.[field]?.[key];
  if (setting === true || (setting !== false && grants.profile?.navigationDefaultAccess !== 'Deny')) return true;
  if (grants.directSets.some((set) => set[field]?.[key] === true)) return true;
  return grants.groups.some(({ group, sets }) =>
    group[mutedField]?.[key] !== true && sets.some((set) => set[field]?.[key] === true));
}
function canOpenApp(principal: Principal, tenant: TenantData, appApiName: string): boolean {
  return canNavigate(principal, tenant, 'app', appApiName);
}
function canOpenTab(principal: Principal, tenant: TenantData, objectApiName: string): boolean {
  return canNavigate(principal, tenant, 'tab', objectApiName);
}
function hasObjectPermission(principal: Principal, tenant: TenantData, objectName: string, action: 'read' | 'create' | 'edit' | 'delete'): boolean {
  return grantedObjectPermission(principal, tenant.objects.find(object => object.apiName === objectName), authorizationGrants(principal, tenant), action);
}
function hasObjectWidePermission(principal: Principal, tenant: TenantData, objectName: string, flag: 'viewAll' | 'modifyAll'): boolean {
  const grants = authorizationGrants(principal, tenant);
  if (!grants) return false;
  const hasGrant = (permission?: ObjectPermission, muted?: Partial<ObjectPermission>) =>
    Boolean(permission?.[flag] && !muted?.[flag] && !muted?.read);
  if (hasGrant(grants.profile?.objectPermissions[objectName])) return true;
  if (grants.directSets.some((set) => hasGrant(set.objectPermissions[objectName]))) return true;
  return grants.groups.some(({ group, sets }) => sets.some((set) =>
    hasGrant(set.objectPermissions[objectName], group.mutedObjectPermissions[objectName])));
}
function hasRoleHierarchyAccess(principal: Principal, tenant: TenantData, ownerId: unknown): boolean {
  if (typeof ownerId !== 'string') return false;
  const viewer = tenant.accessControl.users.find((user) => user.id === principal.userId);
  const owner = tenant.accessControl.users.find((user) => user.id === ownerId);
  if (!viewer || !owner) return false;
  const viewerRoleId = viewer.roleId ?? roleIdForName(viewer.role, tenant.accessControl.roles);
  let parentRoleId = owner.roleId ?? roleIdForName(owner.role, tenant.accessControl.roles);
  const visited = new Set<string>();
  while (parentRoleId && !visited.has(parentRoleId)) {
    if (parentRoleId === viewerRoleId) return true;
    visited.add(parentRoleId);
    parentRoleId = tenant.accessControl.roles.find((role) => role.id === parentRoleId)?.parentRoleId ?? '';
  }
  return false;
}
function roleIsAtOrBelow(roleId: string, rootRoleId: string, roles: TenantData['accessControl']['roles']): boolean {
  let currentRoleId: string | null | undefined = roleId;
  const visited = new Set<string>();
  while (currentRoleId && !visited.has(currentRoleId)) {
    if (currentRoleId === rootRoleId) return true;
    visited.add(currentRoleId);
    currentRoleId = roles.find((role) => role.id === currentRoleId)?.parentRoleId;
  }
  return false;
}
function publicGroupContainsUser(groupId: string, userId: string, tenant: TenantData, visited = new Set<string>()): boolean {
  if (visited.has(groupId)) return false;
  const group = tenant.accessControl.publicGroups.find((item) => item.id === groupId);
  if (!group) return false;
  visited.add(groupId);
  const member = tenant.accessControl.users.find((item) => item.id === userId);
  if (!member) return false;
  const roleId = member.roleId ?? roleIdForName(member.role, tenant.accessControl.roles);
  if (group.userIds.includes(userId)
    || group.roleIds.includes(roleId)
    || group.roleAndSubordinateIds.some((parentId) => roleIsAtOrBelow(roleId, parentId, tenant.accessControl.roles))) return true;
  return group.groupIds.some((nestedId) => publicGroupContainsUser(nestedId, userId, tenant, new Set(visited)));
}
function queueContainsUser(queue: TenantData['accessControl']['queues'][number], userId: string, tenant: TenantData): boolean {
  const member = tenant.accessControl.users.find((item) => item.id === userId);
  if (!member) return false;
  const roleId = member.roleId ?? roleIdForName(member.role, tenant.accessControl.roles);
  return queue.userIds.includes(userId)
    || queue.roleIds.includes(roleId)
    || queue.roleAndSubordinateIds.some((rootRoleId) => roleIsAtOrBelow(roleId, rootRoleId, tenant.accessControl.roles))
    || queue.publicGroupIds.some((groupId) => publicGroupContainsUser(groupId, userId, tenant));
}
function sharingRuleMatchesRecord(rule: TenantData['accessControl']['sharingRules'][number], record: RuntimeRecord): boolean {
  const conditions = rule.criteria.map((criterion) => {
    const value = record[criterion.fieldApiName];
    const expected = criterion.value;
    switch (criterion.operator) {
      case 'Equals': return String(value ?? '') === expected;
      case 'Not Equals': return String(value ?? '') !== expected;
      case 'Contains': return typeof value === 'string' && value.toLowerCase().includes(expected.toLowerCase());
      case 'Starts With': return typeof value === 'string' && value.toLowerCase().startsWith(expected.toLowerCase());
      case 'Is Null': return value === null || value === undefined || value === '';
      case 'Greater Than': return value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) > Number(expected);
      case 'Less Than': return value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) < Number(expected);
    }
  });
  return rule.filterLogic === 'All' ? conditions.every(Boolean) : conditions.some(Boolean);
}
function sharingRuleGrantsUser(rule: TenantData['accessControl']['sharingRules'][number], recipientUserId: string, record: RuntimeRecord, tenant: TenantData): boolean {
  if (!rule.active) return false;
  if (rule.type === 'OwnerBased') {
    const owner = tenant.accessControl.users.find((item) => item.id === record.OwnerId);
    if (!owner) return false;
    const ownerRoleId = owner.roleId ?? roleIdForName(owner.role, tenant.accessControl.roles);
    if (!rule.ownerRoleIds.some((roleId) => roleIsAtOrBelow(ownerRoleId, roleId, tenant.accessControl.roles))) return false;
  } else if (!sharingRuleMatchesRecord(rule, record)) return false;

  const recipient = tenant.accessControl.users.find((item) => item.id === recipientUserId);
  if (!recipient) return false;
  const recipientRoleId = recipient.roleId ?? roleIdForName(recipient.role, tenant.accessControl.roles);
  if (rule.targetType === 'User') return rule.targetId === recipientUserId;
  if (rule.targetType === 'PublicGroup') return publicGroupContainsUser(rule.targetId, recipientUserId, tenant);
  if (rule.targetType === 'Role') return recipientRoleId === rule.targetId;
  return roleIsAtOrBelow(recipientRoleId, rule.targetId, tenant.accessControl.roles);
}
// Scope and cache record-share lookups by immutable tenant state snapshot.
// A sharing change replaces TenantData; an old index cannot authorize new data.
const recordShareIndexes = new WeakMap<TenantData, Map<string, TenantData['recordShares']>>();
function recordShareIndex(tenant: TenantData): Map<string, TenantData['recordShares']> {
  const existing = recordShareIndexes.get(tenant);
  if (existing) return existing;
  const index = new Map<string, TenantData['recordShares']>();
  for (const share of tenant.recordShares) {
    const key = JSON.stringify([share.objectApiName, share.recordId]);
    let list = index.get(key);
    if (!list) { list = []; index.set(key, list); }
    list.push(share);
  }
  recordShareIndexes.set(tenant, index);
  return index;
}
function hasRecordAccess(
  principal: Principal,
  tenant: TenantData,
  objectName: string,
  record: RuntimeRecord,
  accessLevel: 'Read' | 'Edit' | 'Delete',
  visited = new Set<string>()
): boolean {
  if (accessLevel !== 'Read' && !lockedRecordWriteAllowed(principal, tenant.objects.find(object => object.apiName === objectName), record)) return false;
  const recordKey = `${objectName}:${record.Id}:${accessLevel}`;
  if (visited.has(recordKey)) return false;
  visited.add(recordKey);
  const objectAction = accessLevel === 'Read' ? 'read' : accessLevel === 'Edit' ? 'edit' : 'delete';
  // WhatsApp channel permission is independent of object-wide grants, ownership and sharing.
  // Other Communication Records (API audit, email, SMS) keep existing RBAC semantics.
  if (objectName === communicationObjectApiName && isWhatsAppMessage(record) &&
      !canAccessChatterRecord(principal.tenantId, principal.userId, tenant, record, 'read')) return false;
  if (!hasObjectPermission(principal, tenant, objectName, objectAction)) return false;
  const advancedSettings = tenant.sharingSettings[objectName];
  const advancedUser = tenant.accessControl.users.find((user) => user.id === principal.userId);
  const advancedRules = advancedSettings?.restrictionRules ?? [];
  if (advancedRules.length || advancedUser?.userType === 'external') {
    const accountField = advancedSettings?.portalAccountField ?? 'AccountId';
    const recordAccountId = accountField === 'Id' ? record.Id : record[accountField];
    const decision = decideAdvancedRecordAccess({
      context: {
        tenantId: principal.tenantId, userId: principal.userId,
        objectApiName: objectName, operation: objectAction,
        userType: advancedUser?.userType === 'external' ? 'external' : 'internal',
        roleIds: advancedUser?.roleId ? [advancedUser.roleId] : [],
        objectPermission: true,
        externalAccessEnabled: advancedSettings?.portalEnabled === true,
        accountId: advancedUser?.externalAccountId
      },
      record: {
        ...record, tenantId: principal.tenantId,
        accountId: recordAccountId,
        portalVisible: advancedSettings?.portalEnabled === true
      },
      ordinaryAuthorized: true, rules: advancedRules
    });
    if (!decision.allowed) return false;
  }
  // Channel grants are a centrally enforced form of record sharing; they do not
  // override object permission checks or higher-priority restriction rules.
  if (objectName === communicationObjectApiName && isWhatsAppMessage(record)) {
    if (accessLevel === 'Delete') return false;
    return canAccessChatterRecord(principal.tenantId, principal.userId, tenant, record,
      accessLevel === 'Edit' ? 'assign' : 'read');
  }
  if (accessLevel === 'Read' && hasObjectWidePermission(principal, tenant, objectName, 'viewAll')) return true;
  if ((accessLevel === 'Edit' || accessLevel === 'Delete')
    && hasObjectWidePermission(principal, tenant, objectName, 'modifyAll')) return true;
  if (accessLevel !== 'Delete') {
    const object = tenant.objects.find((item) => item.apiName === objectName);
    for (const field of object?.fields ?? []) {
      if (field.relationship?.type !== 'Master-Detail' || typeof record[field.apiName] !== 'string') continue;
      const parent = (tenant.records[field.relationship.targetObject] ?? []).find((item) => item.Id === record[field.apiName]);
      if (parent && hasRecordAccess(principal, tenant, field.relationship.targetObject, parent, accessLevel, new Set(visited))) return true;
    }
  }
  const isQueueMember = typeof record.OwnerId === 'string'
    && tenant.accessControl.queues.some((queue) =>
      queue.id === record.OwnerId && queue.supportedObjectApiNames.includes(objectName)
      && queueContainsUser(queue, principal.userId, tenant));
  const isOwner = record.OwnerId === principal.userId || isQueueMember;
  if (isOwner) return true;
  if (accessLevel === 'Delete') return false;
  const defaultAccess = tenant.sharingSettings[objectName]?.defaultAccess ?? 'Private';
  if (tenant.sharingSettings[objectName]?.grantAccessUsingHierarchies !== false
    && (accessLevel === 'Read' || defaultAccess === 'Public Read/Write')
    && hasRoleHierarchyAccess(principal, tenant, record.OwnerId)) return true;
  const share = (recordShareIndex(tenant).get(JSON.stringify([objectName, record.Id])) ?? []).find((item) =>
    item.userId === principal.userId
      || Boolean(item.groupId && publicGroupContainsUser(item.groupId, principal.userId, tenant)));
  if (share && (share.accessLevel === 'Edit' || accessLevel === 'Read')) return true;
  if (accessLevel === 'Read' && typeof record.TerritoryId === 'string'
    && tenant.dashboardTerritories.length) {
    const territorialGrant = resolveAdvancedRecordGrant({
      tenantId: principal.tenantId, userId: principal.userId,
      recordId: record.Id, recordTerritoryId: record.TerritoryId,
      operation: 'read',
      territoryEdges: tenant.dashboardTerritories.map((entry) => ({
        tenantId: principal.tenantId, id: entry.id, parentId: entry.parentTerritoryId
      })),
      territoryMemberships: tenant.dashboardTerritories.flatMap((entry) =>
        entry.userIds.map((userId) => ({
          tenantId: principal.tenantId, userId, territoryId: entry.id,
          accessLevel: 'read', includeSubordinates: true
        })))
    });
    if (territorialGrant.granted) return true;
  }
  if (tenant.accessControl.sharingRules.some((rule) =>
    rule.objectApiName === objectName
    && (rule.accessLevel === 'Edit' || accessLevel === 'Read')
    && sharingRuleGrantsUser(rule, principal.userId, record, tenant))) return true;
  return defaultAccess === 'Public Read/Write'
    || (defaultAccess === 'Public Read Only' && accessLevel === 'Read');
}
function hasFieldPermission(principal: Principal, tenant: TenantData, objectName: string, fieldName: string, action: 'read' | 'edit'): boolean {
  const grants = authorizationGrants(principal, tenant);
  if (!grants) return false;
  const key = `${objectName}.${fieldName}`;
  const grantsField = (
    fieldPermissions: Record<string, { read: boolean; edit: boolean }>,
    objectPermissions: Record<string, ObjectPermission>,
    muted?: Partial<ObjectPermission>
  ) => {
    const explicit = fieldPermissions[key];
    if (explicit) return explicit[action];
    const objectPermission = objectPermissions[objectName];
    return Boolean(objectPermission && (
      objectPermission[action] && !muted?.[action] && !muted?.read
      || objectPermission.modifyAll && !muted?.modifyAll && !muted?.read && !muted?.[action]
      || action === 'read' && objectPermission.viewAll && !muted?.viewAll && !muted?.read
    ));
  };
  if (grants.profile && grantsField(grants.profile.fieldPermissions, grants.profile.objectPermissions)) return true;
  if (grants.directSets.some((set) => grantsField(set.fieldPermissions, set.objectPermissions))) return true;
  return grants.groups.some(({ group, sets }) => {
    if (group.mutedFieldPermissions[key]?.[action]) return false;
    return sets.some((set) => grantsField(set.fieldPermissions, set.objectPermissions, group.mutedObjectPermissions[objectName]));
  });
}
function sanitizeRecordForRead(principal: Principal, tenant: TenantData, object: ObjectMetadata, record: RuntimeRecord): RuntimeRecord {
  const values: Record<string, unknown> = {};
  const systemFields = new Set(['Id', 'CreatedDate', 'CreatedById', 'LastModifiedDate', 'LastModifiedById', 'SystemModstamp', 'RecordTypeId']);
  for (const [key, value] of Object.entries(record)) {
    if (systemFields.has(key) || hasFieldPermission(principal, tenant, object.apiName, key, 'read')) values[key] = value;
  }
  return values as RuntimeRecord;
}
function assertFieldEditPermissions(principal: Principal, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>): void {
  assertRecordFieldPermissions(principal, tenant, object, values, hasFieldPermission);
}


 return { authorizationGrants, canNavigate, canOpenApp, canOpenTab, hasObjectPermission, hasObjectWidePermission, hasRoleHierarchyAccess, roleIsAtOrBelow, publicGroupContainsUser, queueContainsUser, sharingRuleMatchesRecord, sharingRuleGrantsUser, recordShareIndex, hasRecordAccess, hasFieldPermission, sanitizeRecordForRead, assertFieldEditPermissions };
}
