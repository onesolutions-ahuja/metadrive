import type { Express, Request, Response, RequestHandler } from 'express';
import type { Principal } from '../../auth.js';
import type { TenantData, LocalUser } from '../../index.js';
export function registerIdentityProfileRoute(deps: {
  app: Express; accessAuthentication: RequestHandler; getPrincipal: (res: Response) => Principal;
  principalUser: (p: Principal) => LocalUser | undefined;
  tenantData: (tenantId: string) => TenantData | undefined;
  profileIdForRole: (role: string, profiles: TenantData['accessControl']['profiles']) => string;
  hasFieldPermission: (p: Principal, tenant: TenantData, objectName: string, fieldName: string, action: 'read' | 'edit') => boolean;
  hasRecordTypeAccessForUser: (userId: string, tenant: TenantData, objectName: string, typeId: string) => boolean;
  effectivePermissions: (user: LocalUser, tenant: TenantData) => string[];
}) {
 const {app, accessAuthentication, getPrincipal, principalUser, tenantData, profileIdForRole,
    hasFieldPermission, hasRecordTypeAccessForUser, effectivePermissions} = deps;
app.get('/api/auth/me', accessAuthentication, (req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const user = principalUser(principal);
  if (!user) return res.status(401).json({ error: 'User is not active' });
  const tenant = tenantData(principal.tenantId);
  if (!tenant) return res.status(401).json({ error: 'Tenant is unavailable' });
  const accessUser = tenant.accessControl.users.find((item) => item.id === user.id);
  const profileId = accessUser?.profileId ?? profileIdForRole(user.role, tenant.accessControl.profiles);
  const fieldAccess = Object.fromEntries(tenant.objects.flatMap((object) => object.fields.map((field) => [
    `${object.apiName}.${field.apiName}`,
    {
      read: hasFieldPermission(principal, tenant, object.apiName, field.apiName, 'read'),
      edit: hasFieldPermission(principal, tenant, object.apiName, field.apiName, 'edit')
    }
  ])));
  const recordTypeAccess = Object.fromEntries(tenant.objects.flatMap((object) => (object.recordTypes ?? [])
    .filter((recordType) => recordType.active)
    .map((recordType) => [`${object.apiName}.${recordType.id}`, hasRecordTypeAccessForUser(user.id, tenant, object.apiName, recordType.id)])));
  return res.json({ user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId, role: user.role, profileId, permissions: effectivePermissions(user, tenant), fieldAccess, recordTypeAccess } });
});

}
