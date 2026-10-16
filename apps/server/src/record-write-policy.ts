import {AsyncLocalStorage} from 'node:async_hooks';
import {z} from 'zod';
import type {Request, Response, NextFunction} from 'express';
import type {Principal} from './auth.js';
import type {ObjectMetadata, TenantData} from './index.js';

const apiName = z.string().regex(/^[A-Za-z][A-Za-z0-9_]*$/);
export const recordWritePolicySchema = z.object({
  flowApiNames: z.array(apiName).min(1).max(100),
  operations: z.array(z.enum(['create', 'edit', 'delete'])).min(1),
  protectedFieldApiNames: z.array(apiName).min(1).max(100).optional(),
  lockedRecordFieldApiName: apiName.optional()
}).strict();

type Operation = 'read' | 'create' | 'edit' | 'delete';
type Grant = TenantData['accessControl']['profiles'][number]['objectPermissions'][string];
type PermissionSet = TenantData['accessControl']['permissionSets'][number];
type Group = TenantData['accessControl']['permissionSetGroups'][number];
type Grants = {
  profile?: TenantData['accessControl']['profiles'][number];
  directSets: PermissionSet[];
  groups: Array<{group: Group; sets: PermissionSet[]}>;
};
const contexts = new AsyncLocalStorage<{flowApiName: string; tenantId: string; userId: string}>();

/** The server supplies this context; request bodies cannot select a trusted Flow. */
export function withFlowRecordWriteContext<T>(
  flowApiName: string, tenantId: string, userId: string, work: () => T
): T {
  return contexts.run({flowApiName, tenantId, userId}, work);
}

export function recordWriteContextAllowed(principal: Principal, object: ObjectMetadata): boolean {
  const policy = object.recordWritePolicy;
  if (!policy) return true;
  const context = contexts.getStore();
  return Boolean(context && context.tenantId === principal.tenantId
    && context.userId === principal.userId && policy.flowApiNames.includes(context.flowApiName));
}

/** A protected field can mark a record immutable outside its configured Flows. */
export function lockedRecordWriteAllowed(
  principal: Principal, object: ObjectMetadata | undefined, record: Record<string, unknown>
): boolean {
  const field = object?.recordWritePolicy?.lockedRecordFieldApiName;
  return !object || !field || !record[field] || recordWriteContextAllowed(principal, object);
}

/** Shared object-level grants, including group muting and metadata write policies. */
export function grantedObjectPermission(
  principal: Principal, object: ObjectMetadata | undefined, grants: Grants | undefined, action: Operation
): boolean {
  if (object?.kind === 'Custom Object' && object.settings?.deploymentStatus === 'In Development'
      && !principal.permissions.includes('objects:manage')
      && !principal.permissions.includes('metadata:write')) return false;
  const policy = object?.recordWritePolicy;
  if (action !== 'read' && object && policy?.operations.includes(action)
      && !policy.protectedFieldApiNames && !recordWriteContextAllowed(principal, object)) return false;
  if (!grants) return false;
  const allowed = (permission?: Grant, muted?: Partial<Grant>): boolean => {
    if (!permission) return false;
    if (permission[action] && !muted?.[action] && !muted?.read) return true;
    if (action === 'read') return Boolean((permission.viewAll && !muted?.viewAll
      || permission.modifyAll && !muted?.modifyAll) && !muted?.read);
    return Boolean(action !== 'create' && permission.modifyAll && !muted?.modifyAll
      && !muted?.[action] && !muted?.read);
  };
  const name = object?.apiName ?? '';
  if (grants.profile && allowed(grants.profile.objectPermissions[name])) return true;
  if (grants.directSets.some(set => allowed(set.objectPermissions[name]))) return true;
  return grants.groups.some(({group, sets}) => sets.some(set =>
    allowed(set.objectPermissions[name], group.mutedObjectPermissions[name])));
}

/** Existing field RBAC remains mandatory inside an approved Flow. */
export function assertRecordFieldPermissions(
  principal: Principal, tenant: TenantData, object: ObjectMetadata, values: Record<string, unknown>,
  hasPermission: (principal: Principal, tenant: TenantData, object: string, field: string, action: 'read' | 'edit') => boolean
): void {
  const policy = object.recordWritePolicy;
  if (policy && (policy.operations.includes('edit') || policy.operations.includes('create'))
      && Object.keys(values).some(field => !policy.protectedFieldApiNames
        || policy.protectedFieldApiNames.includes(field))
      && !recordWriteContextAllowed(principal, object)) {
    throw Error('Record write requires an approved Flow for "' + object.apiName + '".');
  }
  for (const field of Object.keys(values)) {
    if (field === 'RecordTypeId') continue;
    if (!hasPermission(principal, tenant, object.apiName, field, 'edit'))
      throw Error('Missing edit permission for field "' + object.apiName + '.' + field + '".');
  }
}

/** Changing security-sensitive write policy metadata requires central security:manage. */
export function recordWritePolicyMetadataGuard(
  principalFor: (res: Response) => Principal, tenantFor: (tenantId: string) => TenantData | undefined
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {next(); return;}
    const principal = principalFor(res);
    const first = req.path.split('/').filter(Boolean)[0];
    const current = tenantFor(principal.tenantId)?.objects.find(object => object.apiName === first);
    const rootWrite = !first || req.path.split('/').filter(Boolean).length === 1;
    const supplied = req.body && typeof req.body === 'object'
      && Object.hasOwn(req.body, 'recordWritePolicy');
    const segments = req.path.split('/').filter(Boolean);
    const protectedField = segments[1] === 'fields' && Boolean(current?.recordWritePolicy)
      && (current?.recordWritePolicy?.protectedFieldApiNames?.includes(segments[2])
        || current?.recordWritePolicy?.lockedRecordFieldApiName === segments[2]);
    const changed = rootWrite && (req.method === 'DELETE' ? Boolean(current?.recordWritePolicy)
      : JSON.stringify(current?.recordWritePolicy) !== JSON.stringify(req.body?.recordWritePolicy));
    if ((supplied || changed || protectedField) && !principal.permissions.includes('security:manage')) {
      res.status(403).json({error: 'Changing record write policies requires security:manage.'});
      return;
    }
    next();
  };
}
