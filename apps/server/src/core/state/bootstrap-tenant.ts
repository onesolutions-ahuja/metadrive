import { hashPassword } from '../../auth.js';
import { randomUUID } from 'node:crypto';
import { roleIdForName, profileIdForRole } from '../../modules/security/role-helpers.js';
import type { createPlatformStateStore } from './store.js';
import type { LocalUser, PlatformState } from './types.js';

export function createTenantBootstrap(deps: {
  platformStore: ReturnType<typeof createPlatformStateStore>;
  persistState: (snapshot: PlatformState) => void;
  createTenant: (tenantId: string, name: string, adminName: string, email: string,
    password: string) => Promise<{ user: LocalUser; created: boolean }>;
}) {
  async function bootstrapTenant(): Promise<void> {
    const tenantId = process.env.METADRIVE_BOOTSTRAP_TENANT_ID;
    const tenantName = process.env.METADRIVE_BOOTSTRAP_TENANT_NAME;
    const adminName = process.env.METADRIVE_BOOTSTRAP_ADMIN_NAME ?? 'Organization Administrator';
    const email = process.env.METADRIVE_BOOTSTRAP_ADMIN_EMAIL;
    const password = process.env.METADRIVE_BOOTSTRAP_ADMIN_PASSWORD;
    if (!tenantId && !tenantName && !email && !password) return;
    if (!tenantId || !tenantName || !email || !password) {
      throw new Error('Set METADRIVE_BOOTSTRAP_TENANT_ID, METADRIVE_BOOTSTRAP_TENANT_NAME, METADRIVE_BOOTSTRAP_ADMIN_EMAIL, and METADRIVE_BOOTSTRAP_ADMIN_PASSWORD together');
    }
    const tenant = deps.platformStore.state.tenants[tenantId];
    const normalizedEmail = email.trim().toLowerCase();
    const existingUser = deps.platformStore.state.users.find((user) => user.email.trim().toLowerCase() === normalizedEmail);
    if (!tenant) {
      await deps.createTenant(tenantId, tenantName, adminName, email, password);
      return;
    }
    // Bootstrap credentials are only for first-time provisioning. Never reset an
    // existing administrator's password on application startup or redeployment.
    const credentials = existingUser ? null : await hashPassword(password);
    const user = existingUser && existingUser.tenantId === tenantId
      ? existingUser
      : {
          id: randomUUID(), tenantId, name: adminName, email: normalizedEmail,
          passwordSalt: credentials!.salt, passwordHash: credentials!.hash,
          role: 'System Administrator', permissionSetIds: ['system-administrator'],
          permissionSetGroupIds: [],
          disabled: false, createdAt: new Date().toISOString()
        };
    if (existingUser && existingUser.tenantId !== tenantId) {
      throw new Error('Bootstrap administrator email already belongs to another tenant');
    }
    const accessUser = {
      id: user.id, name: user.name, username: user.email, role: user.role,
      roleId: roleIdForName(user.role, tenant.accessControl.roles),
      profileId: profileIdForRole(user.role, tenant.accessControl.profiles),
      permissionSetIds: user.permissionSetIds,
      permissionSetGroupIds: user.permissionSetGroupIds,
      timeZone: 'UTC',
      locale: 'en-US'
    };
    const nextTenant = {
      ...tenant,
      accessControl: {
        ...tenant.accessControl,
        users: tenant.accessControl.users.some((item) => item.id === user.id)
          ? tenant.accessControl.users.map((item) => item.id === user.id ? { ...item, ...accessUser } : item)
          : [...tenant.accessControl.users, accessUser]
      }
    };
    const nextState = {
      ...deps.platformStore.state,
      tenants: { ...deps.platformStore.state.tenants, [tenantId]: nextTenant },
      users: deps.platformStore.state.users.some((item) => item.id === user.id)
        ? deps.platformStore.state.users.map((item) => item.id === user.id ? user : item)
        : [...deps.platformStore.state.users, user]
    };
    deps.persistState(nextState);
    deps.platformStore.state = nextState;
  }
  return { bootstrapTenant };
}
