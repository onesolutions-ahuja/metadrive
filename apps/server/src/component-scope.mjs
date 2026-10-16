// Tenant-owned registry entries never cross tenant boundaries. The previous
// unowned component store is only readable in a single-tenant deployment:
// no tenant identity can safely be inferred for legacy entries after expansion.
export function libraryComponentVisible(component, tenantId, tenantIds) {
  if (!component || typeof tenantId !== 'string' || !tenantId ||
      !Array.isArray(tenantIds) || !tenantIds.includes(tenantId)) return false;
  if (component.tenantId !== undefined) return component.tenantId === tenantId;
  if (component.trustedBundled === true) return true;
  return tenantIds.length === 1;
}

export function libraryComponentEditable(component, tenantId, tenantIds) {
  if (!libraryComponentVisible(component, tenantId, tenantIds)) return false;
  if (component.trustedBundled === true) return false;
  return component.tenantId === tenantId ||
    (component.tenantId === undefined && tenantIds.length === 1);
}
