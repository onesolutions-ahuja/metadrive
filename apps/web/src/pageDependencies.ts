import { resolvePageActionRoute } from './pageActionRouting';
import type {
  DashboardMetadata, FlowDefinitionMetadata, LibraryComponentMetadata,
  LightningAppMetadata, LightningPageMetadata, ObjectMetadata, ReportMetadata
} from './metadata';

export type PageDependency = {
  kind: 'Dashboard' | 'Report' | 'Flow' | 'Object' | 'Application' | 'Component' | 'Page';
  name: string;
  componentId?: string;
  status: 'Ready' | 'Missing' | 'Inactive' | 'Contextual';
  description: string;
};

type DependencyScope = {
  apps: LightningAppMetadata[];
  pages: LightningPageMetadata[];
  objects: ObjectMetadata[];
  reports: ReportMetadata[];
  dashboards: DashboardMetadata[];
  flows: FlowDefinitionMetadata[];
  libraryComponents: LibraryComponentMetadata[];
  /** Optional runtime app context, if the editor has a known selected app. */
  currentAppId?: string;
};

const identifier = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

/** Metadata-only dependency inspection. "Ready" is not an RBAC grant: execution
 * and destination record access are authorised by the existing server routes. */
export function inspectPageDependencies(page: LightningPageMetadata, scope: DependencyScope): PageDependency[] {
  const output: PageDependency[] = [];
  const add = (kind: PageDependency['kind'], name: string, componentId: string | undefined,
    status: PageDependency['status'], description: string) =>
    output.push({ kind, name, componentId, status, description });
  const knownObject = (name: string) => scope.objects.some(item => item.apiName === name);
  const knownApp = (name: string) => scope.apps.some(item => item.apiName === name);
  const assignedApps = [...new Set((page.activationAssignments ?? [])
    .map(assignment => identifier(assignment.appId)).filter(Boolean))];
  const appContext = identifier(scope.currentAppId) || (assignedApps.length === 1 ? assignedApps[0] : '');

  if (page.pageType === 'Record Page') {
    add('Object', page.targetObject, undefined,
      knownObject(page.targetObject) ? 'Ready' : 'Missing', 'Record Page object');
  }
  for (const appId of assignedApps) {
    add('Application', appId, undefined,
      knownApp(appId) ? 'Ready' : 'Missing', 'Page activation assignment');
  }

  for (const component of page.components) {
    const properties = component.properties ?? {};
    if (component.type === 'Dashboard') {
      const name = identifier(properties.dashboardApiName);
      const dashboard = scope.dashboards.find(item => item.apiName === name);
      add('Dashboard', name || '(unassigned)', component.id,
        !dashboard ? 'Missing' : dashboard.status === 'Deployed' ? 'Ready' : 'Inactive',
        'Embedded dashboard');
    }
    if (component.type === 'Report Chart') {
      const name = identifier(properties.reportApiName);
      add('Report', name || '(unassigned)', component.id,
        scope.reports.some(item => item.apiName === name) ? 'Ready' : 'Missing',
        'Report chart data source');
    }
    if (component.type.startsWith('Custom:')) {
      const name = component.type.slice('Custom:'.length);
      const definition = scope.libraryComponents.find(item =>
        item.apiName === name && item.surfaces.includes('page'));
      add('Component', name, component.id,
        !definition ? 'Missing' : definition.status === 'Draft' ? 'Inactive' : 'Ready',
        'Reusable component registry');
    }
    // Generic Object binding, shared by built-in and custom components.
    const objectName = identifier(properties.objectApiName);
    if (objectName) add('Object', objectName, component.id,
      knownObject(objectName) ? 'Ready' : 'Missing', 'Component data binding');

    const rawEvents = properties.actionFlows;
    if (!rawEvents || typeof rawEvents !== 'object' || Array.isArray(rawEvents)) continue;
    for (const [event, raw] of Object.entries(rawEvents)) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const binding = raw as Record<string, unknown>;
      if (binding.actionType !== 'Navigate') {
        const name = identifier(binding.flowApiName);
        if (!name) continue;
        const flow = scope.flows.find(item => item.apiName === name);
        const executable = flow?.status === 'Active'
          && (flow.flowType === 'Screen Flow' || flow.flowType === 'Autolaunched Flow');
        add('Flow', name, component.id,
          !flow ? 'Missing' : executable ? 'Ready' : 'Inactive',
          'Component event: ' + event);
        continue;
      }

      const target = binding.navigationTargetType ?? 'Record List';
      const explicitApp = identifier(binding.navigationAppId);
      const navigationApp = explicitApp || appContext;
      const resolve = () => resolvePageActionRoute(binding, {
        objects: scope.objects, apps: scope.apps, pages: scope.pages,
        currentAppId: navigationApp, defaultObjectApiName: page.targetObject ?? ''
      });
      if (target === 'Record List') {
        const name = identifier(binding.navigationObjectApiName) || identifier(page.targetObject);
        let status: PageDependency['status'] = 'Missing';
        try { status = resolve().kind === 'record-list' ? 'Ready' : 'Missing'; } catch { /* invalid metadata */ }
        add('Object', name || '(unassigned)', component.id, status,
          'Event ' + event + ' record-list destination');
      } else if (target === 'App Home') {
        let status: PageDependency['status'] = 'Contextual';
        if (navigationApp) {
          try { status = resolve().kind === 'app-home' ? 'Ready' : 'Missing'; }
          catch { status = 'Missing'; }
        }
        add('Application', navigationApp || '(current application)', component.id,
          status, 'Event ' + event + ' app-home destination');
      } else if (target === 'App Page') {
        const name = identifier(binding.navigationPageApiName);
        const destination = scope.pages.find(item => item.apiName === name);
        let status: PageDependency['status'] = !destination ? 'Missing'
          : destination.status !== 'Active' ? 'Inactive' : 'Contextual';
        if (destination && destination.status === 'Active' && navigationApp) {
          try { status = resolve().kind === 'app-page' ? 'Ready' : 'Missing'; }
          catch { status = 'Missing'; }
        }
        add('Page', name || '(unassigned)', component.id, status,
          'Event ' + event + ' app-page destination');
      } else {
        add('Page', '(invalid destination)', component.id, 'Missing',
          'Event ' + event + ' unsupported navigation destination');
      }
    }
  }
  return output;
}
