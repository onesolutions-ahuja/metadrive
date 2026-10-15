export function defaultRoles() {
  return [
    { id: 'role-executive', name: 'Executive', apiName: 'Executive', parentRoleId: null },
    { id: 'role-sales-manager', name: 'Sales Manager', apiName: 'Sales_Manager', parentRoleId: 'role-executive' },
    { id: 'role-sales-representative', name: 'Sales Representative', apiName: 'Sales_Representative', parentRoleId: 'role-sales-manager' },
    { id: 'role-support-manager', name: 'Support Manager', apiName: 'Support_Manager', parentRoleId: 'role-executive' },
    { id: 'role-support-agent', name: 'Support Agent', apiName: 'Support_Agent', parentRoleId: 'role-support-manager' },
    { id: 'role-standard-user', name: 'Standard User', apiName: 'Standard_User', parentRoleId: 'role-executive' }
  ];
}
export function roleApiNameForName(name: string): string {
  const apiName = name.trim().replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return /^[A-Za-z]/.test(apiName) ? apiName : `Role_${apiName}`;
}
export function roleIdForName<T extends {id: string; name: string}>(name: string, roles: T[]): string {
  const normalized = name.trim().toLowerCase();
  const knownId = normalized === 'system administrator' || normalized === 'executive' ? 'role-executive'
    : normalized === 'sales manager' ? 'role-sales-manager'
      : normalized === 'sales representative' || normalized === 'sales user' ? 'role-sales-representative'
        : normalized === 'support manager' ? 'role-support-manager'
          : normalized === 'support agent' ? 'role-support-agent'
            : normalized === 'standard user' ? 'role-standard-user'
              : '';
  return roles.find((role) => role.id === knownId)?.id
    ?? roles.find((role) => role.name.toLowerCase() === normalized)?.id
    ?? roles.find((role) => role.id === 'role-standard-user')?.id
    ?? roles[0]?.id
    ?? '';
}
export function profileIdForRole<T extends {id: string; label: string}>(role: string, profiles: T[]): string {
  const roleKey = role.trim().toLowerCase();
  const knownId = roleKey === 'system administrator' ? 'system-administrator'
    : roleKey === 'sales manager' ? 'sales-manager'
      : roleKey === 'support agent' ? 'support-agent'
        : '';
  return profiles.find((profile) => profile.id === knownId)?.id
    ?? profiles.find((profile) => profile.label.toLowerCase() === roleKey)?.id
    ?? profiles.find((profile) => profile.id === 'standard-user')?.id
    ?? profiles[0]?.id
    ?? '';
}
