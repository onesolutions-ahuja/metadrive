import type { WorkspaceId } from './metadata';


export const objectSettings = [
  'Details',
  'Schema Builder',
  'Fields & Relationships',
  'Page Layouts',
  'Lightning Record Pages',
  'Buttons, Links, and Actions',
  'Compact Layouts',
  'Field Sets',
  'Object Limits',
  'Change History',
  'Record Types',
  'Related Lookup Filters',
  'Search Layouts',
  'List View Button Layout'
];

const settingRouteNames: Record<string, string> = {
  'Schema Builder': 'SchemaBuilder',
  'Fields & Relationships': 'FieldsAndRelationships',
  'Page Layouts': 'PageLayouts',
  'Lightning Record Pages': 'LightningRecordPages',
  'Buttons, Links, and Actions': 'ButtonsLinksAndActions',
  'Compact Layouts': 'CompactLayouts',
  'Field Sets': 'FieldSets',
  'Object Limits': 'ObjectLimits',
  'Change History': 'ChangeHistory',
  'Record Types': 'RecordTypes',
  'Related Lookup Filters': 'RelatedLookupFilters',
  'Search Layouts': 'SearchLayouts',
  'List View Button Layout': 'ListViewButtonLayout'
};

export function settingFromRoute(value: string): string {
  return Object.entries(settingRouteNames).find(([, routeName]) => routeName === value)?.[0]
    ?? (objectSettings.includes(value) ? value : 'Details');
}

export function settingToRoute(value: string): string {
  return settingRouteNames[value] ?? value.replace(/[^A-Za-z0-9]/g, '');
}
export type AppRoute =
  | { kind: 'setup'; workspace: WorkspaceId; objectApiName?: string; setting?: string; resourceApiName?: string; resourceId?: string; dashboardView?: boolean }
  | { kind: 'app-home'; appId: string }
  | { kind: 'app-page'; appId: string; pageApiName: string }
  | { kind: 'route-alias'; appId: string; slug: string }
  | { kind: 'record-list'; objectApiName: string; appId?: string }
  | { kind: 'record-detail'; objectApiName: string; recordId: string; appId?: string };

export function parseAppRoute(pathname: string, search = ''): AppRoute {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  if (basePath && pathname.startsWith(basePath + '/')) pathname = pathname.slice(basePath.length);
  const pathSegments = pathname.split('/').filter(Boolean);
  const segments = pathSegments[0] === 'une' ? pathSegments.slice(1) : [];
  const appId = new URLSearchParams(search).get('appId') || 'Records';
  try {
    if (segments.length === 3 && segments[0] === 'apps' && segments[2] === 'home') {
      return { kind: 'app-home', appId: decodeURIComponent(segments[1]) };
    }
    if (segments.length === 4 && segments[0] === 'apps' && segments[2] === 'routes') {
      return { kind: 'route-alias', appId: decodeURIComponent(segments[1]), slug: decodeURIComponent(segments[3]) };
    }
    if (segments.length === 4 && segments[0] === 'apps' && segments[2] === 'pages') {
      return { kind: 'app-page', appId: decodeURIComponent(segments[1]), pageApiName: decodeURIComponent(segments[3]) };
    }
    if (segments.length === 2 && segments[0] === 'dashboards') {
      return { kind: 'setup', workspace: 'dashboard-builder', resourceApiName: decodeURIComponent(segments[1]), dashboardView: true };
    }
    if (segments[0] === 'setup') {
      const workspace = decodeURIComponent(segments[1] ?? 'home') as WorkspaceId;
      const validWorkspaces: WorkspaceId[] = ['home', 'object-manager', 'page-builder', 'dashboard-builder', 'report-builder', 'flow-builder', 'flow-interviews', 'scheduled-flows', 'flow-logs', 'automation-settings', 'approval-processes', 'component-library', 'app-manager', 'app-exchange', 'connector-settings', 'named-credentials', 'company-settings', 'tenant-management', 'rbac'];
      if (!validWorkspaces.includes(workspace)) return { kind: 'setup', workspace: 'home' };
      if (workspace === 'object-manager') {
        return {
          kind: 'setup',
          workspace,
          ...(segments[2] ? { objectApiName: decodeURIComponent(segments[2]) } : {}),
          ...(segments[3] ? { setting: settingFromRoute(decodeURIComponent(segments[3])) } : {})
        };
      }
      if (segments[2]) {
        return {
          kind: 'setup',
          workspace,
          resourceApiName: decodeURIComponent(segments[2]),
          ...(segments[3] ? { resourceId: decodeURIComponent(segments[3]) } : {})
        };
      }
      return { kind: 'setup', workspace };
    }
    if (segments.length === 3 && segments[0] === 'o' && segments[2] === 'list') {
      return { kind: 'record-list', objectApiName: decodeURIComponent(segments[1]), appId };
    }
    if (segments.length === 4 && segments[0] === 'r' && segments[3] === 'view') {
      return {
        kind: 'record-detail',
        objectApiName: decodeURIComponent(segments[1]),
        recordId: decodeURIComponent(segments[2]),
        appId
      };
    }
  } catch {
    return { kind: 'setup', workspace: 'home' };
  }
  return { kind: 'setup', workspace: 'home' };
}

export function appRoutePath(route: AppRoute): string {
  const path = appRoutePathWithoutBase(route);
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return basePath + path;
}

export function appRoutePathWithoutBase(route: AppRoute): string {
  if (route.kind === 'setup') {
    if (route.dashboardView && route.resourceApiName) {
      return `/une/dashboards/${encodeURIComponent(route.resourceApiName)}`;
    }
    const segments = ['/une/setup', encodeURIComponent(route.workspace)];
    if (route.workspace === 'object-manager') {
      if (route.objectApiName) segments.push(encodeURIComponent(route.objectApiName));
      if (route.setting) segments.push(encodeURIComponent(settingToRoute(route.setting)));
    } else if (route.resourceApiName) {
      segments.push(encodeURIComponent(route.resourceApiName));
      if (route.resourceId) segments.push(encodeURIComponent(route.resourceId));
    }
    return segments.join('/');
  }
  if (route.kind === 'app-home') return `/une/apps/${encodeURIComponent(route.appId)}/home`;
  if (route.kind === 'app-page') return `/une/apps/${encodeURIComponent(route.appId)}/pages/${encodeURIComponent(route.pageApiName)}`;
  if (route.kind === 'route-alias') return `/une/apps/${encodeURIComponent(route.appId)}/routes/${encodeURIComponent(route.slug)}`;
  if (route.kind === 'record-list') {
    const query = new URLSearchParams({ filterName: `All${route.objectApiName}s` });
    if (route.appId) query.set('appId', route.appId);
    return `/une/o/${encodeURIComponent(route.objectApiName)}/list?${query.toString()}`;
  }
  if (route.kind === 'record-detail') {
    const path = `/une/r/${encodeURIComponent(route.objectApiName)}/${encodeURIComponent(route.recordId)}/view`;
    return route.appId ? `${path}?${new URLSearchParams({ appId: route.appId }).toString()}` : path;
  }
  return '/une/setup/home';
}
