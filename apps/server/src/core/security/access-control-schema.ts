import { z } from 'zod';
import { sharedTimeZoneSchema as dashboardTimeZoneSchema } from '../time-zone-schema.js';

/** Canonical metadata permissions, profiles, roles, groups, queues and sharing rules. */
const objectPermissionFlagsSchema = z.object({
  read: z.boolean(), create: z.boolean(), edit: z.boolean(), delete: z.boolean(),
  viewAll: z.boolean(), modifyAll: z.boolean()
});
const objectPermissionSchema = objectPermissionFlagsSchema.superRefine((permission, context) => {
  if ((permission.create || permission.edit || permission.delete || permission.viewAll || permission.modifyAll) && !permission.read) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['read'], message: 'Object write, view-all, and modify-all access require read access' });
  }
});
export type ObjectPermission = z.infer<typeof objectPermissionFlagsSchema>;
// Navigation access does not bypass object, field or row permissions.
const navigationGrantSchema = z.record(z.boolean()).optional();
const permissionSetSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  apiName: z.string().min(1),
  license: z.string().min(1),
  description: z.string(),
  systemPermissions: z.array(z.string()),
  objectPermissions: z.record(objectPermissionSchema),
  recordTypePermissions: z.record(z.boolean()).default({}),
  appPermissions: navigationGrantSchema,
  tabPermissions: navigationGrantSchema,
  fieldPermissions: z.record(z.object({ read: z.boolean(), edit: z.boolean(), create: z.boolean().optional(), delete: z.boolean().optional() }).superRefine((permission, context) => {
    if (permission.edit && !permission.read) context.addIssue({ code: z.ZodIssueCode.custom, path: ['read'], message: 'Field edit access requires read access' });
  }))
});
const profileSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  license: z.string().min(1),
  description: z.string().max(500),
  isStandard: z.boolean(),
  systemPermissions: z.array(z.string()),
  objectPermissions: z.record(objectPermissionSchema),
  recordTypePermissions: z.record(z.boolean()).default({}),
  appPermissions: navigationGrantSchema,
  tabPermissions: navigationGrantSchema,
  navigationDefaultAccess: z.enum(['Allow','Deny']).default('Allow'),
  fieldPermissions: z.record(z.object({ read: z.boolean(), edit: z.boolean(), create: z.boolean().optional(), delete: z.boolean().optional() }).superRefine((permission, context) => {
    if (permission.edit && !permission.read) context.addIssue({ code: z.ZodIssueCode.custom, path: ['read'], message: 'Field edit access requires read access' });
  }))
});
const permissionSetGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  description: z.string(),
  permissionSetIds: z.array(z.string()),
  calculationStatus: z.enum(['Updated', 'Updating', 'Failed']).default('Updated'),
  lastCalculatedAt: z.string().datetime().nullable().default(null),
  mutedSystemPermissions: z.array(z.string()).default([]),
  mutedObjectPermissions: z.record(objectPermissionFlagsSchema.partial()).default({}),
  mutedRecordTypePermissions: z.record(z.boolean()).default({}),
  mutedAppPermissions: navigationGrantSchema,
  mutedTabPermissions: navigationGrantSchema,
  mutedFieldPermissions: z.record(z.object({ read: z.boolean().optional(), edit: z.boolean().optional(), create: z.boolean().optional(), delete: z.boolean().optional() })).default({})
});
const accessUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  username: z.string().email(),
  role: z.string().min(1),
  roleId: z.string().optional(),
  profileId: z.string().optional(),
  permissionSetIds: z.array(z.string()),
  permissionSetGroupIds: z.array(z.string()).default([]),
  timeZone: z.string().default('UTC'),
  locale: z.string().default('en-US'),
  currencyIsoCode: z.string().regex(/^[A-Z]{3}$/).optional(),
  userType: z.enum(['internal', 'external']).optional(),
  externalAccountId: z.string().min(1).max(128).optional()
}).superRefine((user, context) => {
  if (!dashboardTimeZoneSchema.safeParse(user.timeZone).success) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['timeZone'], message: 'User time zone must be a valid IANA time zone' });
  }
  try {
    new Intl.NumberFormat(user.locale);
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['locale'], message: 'User locale must be a valid BCP 47 locale identifier' });
  }
});
const roleSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/).optional(),
  parentRoleId: z.string().nullable()
});
const publicGroupSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  description: z.string().max(500).default(''),
  userIds: z.array(z.string()).default([]),
  roleIds: z.array(z.string()).default([]),
  roleAndSubordinateIds: z.array(z.string()).default([]),
  groupIds: z.array(z.string()).default([])
});
const queueSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  description: z.string().max(500).default(''),
  supportedObjectApiNames: z.array(z.string().min(1)).min(1),
  userIds: z.array(z.string()).default([]),
  roleIds: z.array(z.string()).default([]),
  roleAndSubordinateIds: z.array(z.string()).default([]),
  publicGroupIds: z.array(z.string()).default([])
});
const sharingRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().trim().min(1).max(80),
  apiName: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/),
  objectApiName: z.string().min(1),
  active: z.boolean().default(true),
  type: z.enum(['OwnerBased', 'CriteriaBased']),
  ownerRoleIds: z.array(z.string()).default([]),
  criteria: z.array(z.object({
    fieldApiName: z.string().min(1),
    operator: z.enum(['Equals', 'Not Equals', 'Contains', 'Starts With', 'Greater Than', 'Less Than', 'Is Null']),
    value: z.string().default('')
  })).default([]),
  filterLogic: z.enum(['All', 'Any']).default('All'),
  targetType: z.enum(['User', 'PublicGroup', 'Role', 'RoleAndSubordinates']),
  targetId: z.string().min(1),
  accessLevel: z.enum(['Read', 'Edit'])
}).superRefine((rule, context) => {
  if (rule.type === 'OwnerBased' && !rule.ownerRoleIds.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerRoleIds'], message: 'Owner-based rules must select at least one source role' });
  }
  if (rule.type === 'CriteriaBased' && !rule.criteria.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['criteria'], message: 'Criteria-based rules must include at least one condition' });
  }
  if (rule.type === 'CriteriaBased' && rule.criteria.some((criterion) => criterion.operator === 'Is Null' && criterion.value !== '')) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['criteria'], message: 'Is Null conditions cannot have a value' });
  }
});
const accessControlSchema = z.object({
  profiles: z.array(profileSchema).default([]),
  permissionSets: z.array(permissionSetSchema),
  permissionSetGroups: z.array(permissionSetGroupSchema).default([]),
  roles: z.array(roleSchema).default([]),
  publicGroups: z.array(publicGroupSchema).default([]),
  queues: z.array(queueSchema).default([]),
  sharingRules: z.array(sharingRuleSchema).default([]),
  users: z.array(accessUserSchema)
}).superRefine((access, context) => {
  const profileIds = new Set(access.profiles.map((profile) => profile.id));
  const setIds = new Set(access.permissionSets.map((set) => set.id));
  const groupIds = new Set(access.permissionSetGroups.map((group) => group.id));
  const roleIds = new Set(access.roles.map((role) => role.id));
  const publicGroupIds = new Set(access.publicGroups.map((group) => group.id));
  const duplicate = (values: string[]) => values.some((value, index) => values.indexOf(value) !== index);
  if (duplicate(access.profiles.map((profile) => profile.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles'], message: 'Profile IDs must be unique' });
  if (duplicate(access.profiles.map((profile) => profile.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['profiles'], message: 'Profile API names must be unique' });
  if (duplicate(access.permissionSets.map((set) => set.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSets'], message: 'Permission set IDs must be unique' });
  if (duplicate(access.permissionSetGroups.map((group) => group.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups'], message: 'Permission set group IDs must be unique' });
  if (duplicate(access.permissionSets.map((set) => set.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSets'], message: 'Permission set API names must be unique' });
  if (duplicate(access.permissionSetGroups.map((group) => group.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups'], message: 'Permission set group API names must be unique' });
  if (duplicate(access.roles.map((role) => role.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles'], message: 'Role IDs must be unique' });
  if (duplicate(access.roles.map((role) => role.name.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles'], message: 'Role names must be unique' });
  if (duplicate(access.roles.flatMap((role) => role.apiName ? [role.apiName.toLowerCase()] : []))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles'], message: 'Role API names must be unique' });
  }
  if (duplicate(access.publicGroups.map((group) => group.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups'], message: 'Public group IDs must be unique' });
  if (duplicate(access.publicGroups.map((group) => group.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups'], message: 'Public group API names must be unique' });
  if (duplicate(access.queues.map((queue) => queue.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues'], message: 'Queue IDs must be unique' });
  if (duplicate(access.queues.map((queue) => queue.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues'], message: 'Queue API names must be unique' });
  if (duplicate(access.sharingRules.map((rule) => rule.id))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules'], message: 'Sharing rule IDs must be unique' });
  if (duplicate(access.sharingRules.map((rule) => rule.apiName.toLowerCase()))) context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules'], message: 'Sharing rule API names must be unique' });
  if (duplicate(access.users.map((user) => user.username.trim().toLowerCase()))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['users'], message: 'User email addresses must be unique' });
  }
  for (const [index, role] of access.roles.entries()) {
    if (role.parentRoleId && !roleIds.has(role.parentRoleId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles', index, 'parentRoleId'], message: `Unknown parent role ${role.parentRoleId}` });
    }
    const visited = new Set<string>([role.id]);
    let parentRoleId = role.parentRoleId;
    while (parentRoleId) {
      if (visited.has(parentRoleId)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['roles', index, 'parentRoleId'], message: 'Role hierarchy cannot contain cycles' });
        break;
      }
      visited.add(parentRoleId);
      parentRoleId = access.roles.find((candidate) => candidate.id === parentRoleId)?.parentRoleId ?? null;
    }
  }
  for (const [index, group] of access.permissionSetGroups.entries()) {
    if (group.lastCalculatedAt && Number.isNaN(Date.parse(group.lastCalculatedAt))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups', index, 'lastCalculatedAt'], message: 'Calculation timestamp must be valid' });
    }
    for (const setId of group.permissionSetIds) {
      if (!setIds.has(setId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups', index, 'permissionSetIds'], message: `Unknown permission set ${setId}` });
    }
    if (duplicate(group.permissionSetIds)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['permissionSetGroups', index, 'permissionSetIds'], message: 'Permission set group members must be unique' });
  }
  for (const [index, group] of access.publicGroups.entries()) {
    for (const roleId of [...group.roleIds, ...group.roleAndSubordinateIds]) {
      if (!roleIds.has(roleId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups', index], message: `Unknown role ${roleId}` });
    }
    for (const groupId of group.groupIds) {
      if (!publicGroupIds.has(groupId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups', index, 'groupIds'], message: `Unknown public group ${groupId}` });
    }
    if (duplicate(group.userIds) || duplicate(group.roleIds) || duplicate(group.roleAndSubordinateIds) || duplicate(group.groupIds)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups', index], message: 'Public group members must be unique' });
    }
    const visited = new Set<string>([group.id]);
    const visit = (candidate: typeof group, path: Set<string>) => {
      for (const nestedId of candidate.groupIds) {
        if (path.has(nestedId)) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ['publicGroups', index, 'groupIds'], message: 'Public group membership cannot contain cycles' });
          continue;
        }
        const nested = access.publicGroups.find((item) => item.id === nestedId);
        if (nested) visit(nested, new Set([...path, nestedId]));
      }
    };
    visit(group, visited);
  }
  for (const [index, rule] of access.sharingRules.entries()) {
    if (rule.type === 'OwnerBased' && rule.ownerRoleIds.some((roleId) => !roleIds.has(roleId))) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules', index, 'ownerRoleIds'], message: 'Sharing rules must reference existing owner roles' });
    }
    if ((rule.targetType === 'Role' || rule.targetType === 'RoleAndSubordinates') && !roleIds.has(rule.targetId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules', index, 'targetId'], message: `Unknown target role ${rule.targetId}` });
    }
    if (rule.targetType === 'PublicGroup' && !publicGroupIds.has(rule.targetId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['sharingRules', index, 'targetId'], message: `Unknown target public group ${rule.targetId}` });
    }
  }
  for (const [index, queue] of access.queues.entries()) {
    if (duplicate(queue.userIds) || duplicate(queue.roleIds) || duplicate(queue.roleAndSubordinateIds) || duplicate(queue.publicGroupIds)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues', index], message: 'Queue members must be unique' });
    }
    for (const roleId of [...queue.roleIds, ...queue.roleAndSubordinateIds]) {
      if (!roleIds.has(roleId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues', index], message: `Unknown queue member role ${roleId}` });
    }
    for (const groupId of queue.publicGroupIds) {
      if (!publicGroupIds.has(groupId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues', index, 'publicGroupIds'], message: `Unknown queue member public group ${groupId}` });
    }
    if (duplicate(queue.supportedObjectApiNames)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['queues', index, 'supportedObjectApiNames'], message: 'Queue object assignments must be unique' });
    }
  }
  for (const [index, user] of access.users.entries()) {
    if (user.roleId && !roleIds.has(user.roleId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index, 'roleId'], message: `Unknown role ${user.roleId}` });
    if (user.profileId && !profileIds.has(user.profileId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index, 'profileId'], message: `Unknown profile ${user.profileId}` });
    for (const setId of user.permissionSetIds) {
      if (!setIds.has(setId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index, 'permissionSetIds'], message: `Unknown permission set ${setId}` });
    }
    for (const groupId of user.permissionSetGroupIds) {
      if (!groupIds.has(groupId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index, 'permissionSetGroupIds'], message: `Unknown permission set group ${groupId}` });
    }
    if (duplicate(user.permissionSetIds) || duplicate(user.permissionSetGroupIds)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['users', index], message: 'User permission assignments must be unique' });
    }
  }
});

export { objectPermissionFlagsSchema, objectPermissionSchema, navigationGrantSchema, permissionSetSchema, profileSchema, permissionSetGroupSchema, accessUserSchema, roleSchema, publicGroupSchema, queueSchema, sharingRuleSchema, accessControlSchema };
