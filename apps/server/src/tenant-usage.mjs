// MD-03.8: coarse tenant-wide usage counts only, never business records,
// account emails, raw events, credentials, password hashes or secret payloads.
// Counting happens on demand for the selected tenant, not for directory pages.
export const ADVISORY_KEYS = Object.freeze(['users', 'records', 'objects', 'flows']);

const size = value => Array.isArray(value) ? value.length : 0;
const sum = values => values.reduce((total, value) => total + size(value), 0);

export function tenantUsageSnapshot({ tenantId, tenant, users, registry, now = new Date() }) {
  if (typeof tenantId !== 'string' || !tenantId || !tenant || !registry ||
      !Array.isArray(users) || !Number.isFinite(new Date(now).getTime()))
    throw new Error('A known tenant and valid sample time are required');
  // The caller is expected to select ONE tenant before invoking this
  // function. Recheck identity ownership defensively, even for platform routes.
  const tenantUsers = users.filter(user => user?.tenantId === tenantId);
  const objects = tenant.objects ?? [];
  const flows = tenant.flows ?? [];
  const counts = {
    users: tenantUsers.length,
    activeUsers: tenantUsers.filter(user => !user.disabled).length,
    objects: size(objects),
    customObjects: objects.filter(object => object.kind === 'Custom Object').length,
    fields: objects.reduce((count, object) => count + size(object.fields), 0),
    records: sum(Object.values(tenant.records ?? {})),
    flows: size(flows),
    activeFlows: flows.filter(flow => flow.activeVersion !== null && flow.activeVersion !== undefined).length,
    pages: size(tenant.pages),
    apps: size(tenant.apps),
    reports: size(tenant.reports),
    dashboards: size(tenant.dashboards),
    namedCredentials: size(tenant.namedCredentials),
    pendingApprovals: (tenant.approvalRequests ?? []).filter(request => request.status === 'Pending').length,
    verifiedDomains: (registry.domains ?? []).filter(domain => domain.status === 'VERIFIED').length
  };
  const targets = Object.fromEntries(ADVISORY_KEYS.flatMap(key => {
    const target = registry.usageTargets?.[key];
    return Number.isSafeInteger(target) && target > 0 ? [[key, target]] : [];
  }));
  const warnings = ADVISORY_KEYS.filter(key => targets[key] !== undefined && counts[key] >= targets[key]);
  return {
    tenantId, status: registry.status ?? 'ACTIVE', sampledAt: new Date(now).toISOString(),
    counts, targets, warnings, enforcement: 'advisory_only',
    // Bytes and bandwidth are not measured: never present JSON size as DB storage.
    storageBytes: null
  };
}
