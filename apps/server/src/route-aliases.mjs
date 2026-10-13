// MD-09 — generic metadata route destinations only. Never accept raw URLs or scripts.
export const aliasPattern = /^[a-z](?:[a-z0-9-]{0,61}[a-z0-9])$/;
const identifierPattern = /^[A-Za-z][A-Za-z0-9_]*$/;
export const routeAliasKinds = ['App Home', 'App Page', 'Record List'];
export const validAliasSlug = (value) => typeof value === 'string' && aliasPattern.test(value);
export const validRouteIdentifier = (value) => typeof value === 'string' && identifierPattern.test(value);

export function validateRouteAliasInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || !validAliasSlug(input.slug) || !validRouteIdentifier(input.appId)
      || !routeAliasKinds.includes(input.kind)
      || !validRouteIdentifier(input.targetApiName)
      || !['Active', 'Disabled'].includes(input.status)
      || !Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    throw new Error('Invalid route alias metadata');
  }
  return { slug: input.slug, appId: input.appId, kind: input.kind,
    targetApiName: input.targetApiName, status: input.status,
    expectedVersion: input.expectedVersion };
}

/**
 * Returns the canonical runtime URL, never arbitrary user-authored URL text.
 * Always re-evaluate current app/page/object metadata and RBAC at read time.
 * A stale alias must fail closed, even if it was previously valid.
 */
export function routeAliasDestination(alias, context) {
  if (!alias || !validAliasSlug(alias.slug) || !validRouteIdentifier(alias.appId)
      || !validRouteIdentifier(alias.targetApiName) || alias.status !== 'Active'
      || !routeAliasKinds.includes(alias.kind)) return null;
  const app = context.apps.find(item => item.apiName === alias.appId);
  if (!app || !context.canOpenApp(alias.appId)) return null;
  const appPath = encodeURIComponent(alias.appId);
  if (alias.kind === 'App Home') {
    return alias.targetApiName === alias.appId ? '/une/apps/' + appPath + '/home' : null;
  }
  if (alias.kind === 'App Page') {
    const page = context.pages.find(item => item.apiName === alias.targetApiName);
    const assigned = (app.navigationPageApiNames ?? []).includes(alias.targetApiName)
      || (page?.activationAssignments ?? []).some(item => item.appId === alias.appId);
    return page?.pageType === 'App Page' && page.status === 'Active' && assigned
      ? '/une/apps/' + appPath + '/pages/' + encodeURIComponent(alias.targetApiName) : null;
  }
  const object = context.objects.find(item => item.apiName === alias.targetApiName);
  if (!object || !(app.navigationItems ?? []).includes(alias.targetApiName)
      || !context.canOpenTab(alias.targetApiName)) return null;
  const search = new URLSearchParams({ filterName: 'All' + alias.targetApiName + 's', appId: alias.appId });
  return '/une/o/' + encodeURIComponent(alias.targetApiName) + '/list?' + search;
}

export function rowToRouteAlias(row) {
  return { appId: row.app_api_name, slug: row.slug, kind: row.target_kind,
    targetApiName: row.target_api_name, status: row.status, version: Number(row.version),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at };
}
