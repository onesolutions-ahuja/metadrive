// MD-03.4. Fast, storage-mode-independent identity boundary. All canonical
// snapshots (Aiven JSONB, relational and SQL-only) must preserve the same
// tenant ownership invariants. No customer record values are inspected here.
export function assertTenantIdentityIsolation(state) {
  if (!state || typeof state !== 'object' || !state.tenants || typeof state.tenants !== 'object')
    throw Error('Tenant isolation: missing tenant registry');
  if (!Array.isArray(state.users) || !Array.isArray(state.refreshSessions))
    throw Error('Tenant isolation: missing identities or sessions');
  const tenants = state.tenants;
  const usersById = new Map();
  const emails = new Set();
  for (const user of state.users) {
    if (typeof user?.id !== 'string' || !user.id ||
        typeof user.tenantId !== 'string' ||
        !Object.hasOwn(tenants, user.tenantId))
      throw Error('Tenant isolation: user references a missing tenant');
    if (usersById.has(user.id)) throw Error('Tenant isolation: duplicate user identity');
    usersById.set(user.id, user.tenantId);
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    if (!email || emails.has(email)) throw Error('Tenant isolation: duplicate or missing user email');
    emails.add(email);
  }
  for (const session of state.refreshSessions) {
    if (!session || typeof session.userId !== 'string' ||
        typeof session.tenantId !== 'string' || !Object.hasOwn(tenants, session.tenantId))
      throw Error('Tenant isolation: session references a missing tenant');
    const actualTenant = usersById.get(session.userId);
    if (actualTenant && actualTenant !== session.tenantId)
      throw Error('Tenant isolation: session identity belongs to another tenant');
    // Historical revoked/rotated tokens may outlive deletion of their user.
    // A live session may never point to a missing user.
    if (!actualTenant && session.revokedAt == null && session.usedAt == null)
      throw Error('Tenant isolation: active session has no owning user');
  }
  for (const [tenantId, data] of Object.entries(tenants)) {
    const accessUsers = data?.accessControl?.users;
    if (accessUsers !== undefined) {
      if (!Array.isArray(accessUsers)) throw Error('Tenant isolation: invalid access-control identities');
      const accessIds = new Set();
      for (const user of accessUsers) {
        if (typeof user?.id !== 'string' || !user.id)
          throw Error('Tenant isolation: invalid access-control user identity');
        if (accessIds.has(user.id))
          throw Error('Tenant isolation: duplicate access-control user identity');
        accessIds.add(user.id);
        if (usersById.has(user.id) && usersById.get(user.id) !== tenantId)
          throw Error('Tenant isolation: access-control user belongs to another tenant');
        if (!usersById.has(user.id))
          throw Error('Tenant isolation: access-control user has no tenant identity');
      }
    }
  }
  return true;
}
