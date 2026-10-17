import { inspectPageDependencies } from './pageDependencies';
import type {
  DashboardMetadata, FlowDefinitionMetadata, LibraryComponentMetadata,
  LightningAppMetadata, LightningPageMetadata, ObjectMetadata, ReportMetadata
} from './metadata';

export type SetupLevel = 'configured' | 'action' | 'review';
export type SetupDestination = 'object-manager' | 'page-builder' | 'flow-builder' | 'rbac' | 'app-exchange';
export type SetupCheck = {
  id: string;
  title: string;
  level: SetupLevel;
  detail: string;
  findings: string[];
  destination?: SetupDestination;
};

type AppSetupScope = {
  app: LightningAppMetadata;
  apps: LightningAppMetadata[];
  creating?: boolean;
  objects: ObjectMetadata[];
  pages: LightningPageMetadata[];
  flows?: FlowDefinitionMetadata[];
  libraryComponents?: LibraryComponentMetadata[];
  reports?: ReportMetadata[];
  dashboards?: DashboardMetadata[];
};

/** The app identity is distinct from an AppExchange package installation key. */
export function suggestAppApiName(label: string, existing: readonly Pick<LightningAppMetadata, 'apiName'>[]): string {
  const words = label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let base = words.map(word => word[0].toUpperCase() + word.slice(1)).join('');
  if (!base) base = 'App';
  if (!/^[A-Za-z]/.test(base)) base = 'App' + base;
  base = base.slice(0, 76);
  const occupied = new Set(existing.map(app => app.apiName.toLowerCase()));
  if (!occupied.has(base.toLowerCase())) return base;
  for (let suffix = 2; suffix < 100000; suffix++) {
    const candidate = base.slice(0, 80 - String(suffix).length) + suffix;
    if (!occupied.has(candidate.toLowerCase())) return candidate;
  }
  return base + 'New';
}

/** Metadata-level guidance only. Never equate this report with runtime, RBAC or payment certification. */
export function assessApplicationSetup({
  app, apps, objects, pages, creating = false, flows = [], libraryComponents = [], reports = [], dashboards = []
}: AppSetupScope): SetupCheck[] {
  const checks: SetupCheck[] = [];
  const add = (item: SetupCheck) => checks.push(item);
  const exists = creating && apps.some(item => item.apiName.toLowerCase() === app.apiName.toLowerCase());
  const identityFindings = [
    ...(!/^[A-Za-z][A-Za-z0-9_]*$/.test(app.apiName) ? ['Choose a developer name using letters, digits or underscores, starting with a letter.'] : []),
    ...(!app.label.trim() ? ['Enter an application label.'] : []),
    ...(exists ? ['Another application already uses this developer name.'] : [])
  ];
  add({
    id: 'identity', title: 'Application identity', level: identityFindings.length ? 'action' : 'configured',
    detail: identityFindings.length ? 'Finish the application name before saving.' : 'Application name follows the Lightning App naming rules.',
    findings: identityFindings
  });

  const selectedObjects = app.navigationItems.map(name => objects.find(object => object.apiName === name));
  const missingObjects = app.navigationItems.filter((name, index) => !selectedObjects[index]);
  const labels = new Map<string, string[]>();
  for (const object of selectedObjects) if (object) {
    const label = object.label.toLowerCase();
    labels.set(label, [...(labels.get(label) ?? []), object.apiName]);
  }
  const duplicateLabels = [...labels.values()].filter(names => names.length > 1);
  const objectFindings = [
    ...missingObjects.map(name => 'Selected object is missing: ' + name),
    ...duplicateLabels.map(names => 'Same object label, different API names: ' + names.join(', '))
  ];
  add({
    id: 'data', title: 'Objects and fields',
    level: missingObjects.length ? 'action' : !selectedObjects.length || duplicateLabels.length ? 'review' : 'configured',
    detail: selectedObjects.length ? selectedObjects.filter(Boolean).length + ' object(s) selected for navigation.' : 'Object-only navigation is optional when the application uses App Pages.',
    findings: objectFindings.length ? objectFindings : ['Verify field mappings and suitable tenant business records in Object Manager.'],
    destination: 'object-manager'
  });

  const linked = [...new Set([
    ...app.navigationPageApiNames,
    ...pages.filter(page => page.activationAssignments?.some(rule => rule.appId === app.apiName))
      .map(page => page.apiName)
  ])];
  const activePages: LightningPageMetadata[] = [];
  const pageFindings: string[] = [];
  for (const name of linked) {
    const page = pages.find(item => item.apiName === name);
    if (!page) { pageFindings.push('Linked page is missing: ' + name); continue; }
    if (page.status !== 'Active') pageFindings.push(page.label + ' (' + page.apiName + ') is a Draft.');
    if (app.navigationPageApiNames.includes(name) && page.pageType !== 'App Page') {
      pageFindings.push(page.label + ' is not an App Page.');
    }
    if (page.status === 'Active') activePages.push(page);
  }
  const unattachedDrafts = pages.filter(page => page.status === 'Draft'
    && page.activationAssignments?.some(rule => rule.appId === app.apiName));
  if (unattachedDrafts.length) pageFindings.push(unattachedDrafts.length + ' draft page(s) have app assignments but are not active.');
  add({
    id: 'pages', title: 'Pages and navigation',
    level: pageFindings.length ? 'action' : !linked.length ? 'review' : 'configured',
    detail: linked.length ? linked.length + ' page(s) referenced through navigation or activation.' : 'No App Pages attached; object-only applications can still operate.',
    findings: pageFindings.length ? pageFindings : ['Check page type, app assignment, navigation and active status before launch.'],
    destination: 'page-builder'
  });

  const dependencies = activePages.flatMap(page => inspectPageDependencies(page, {
    apps, pages, objects, flows, libraryComponents, reports, dashboards, currentAppId: app.apiName
  }).map(item => ({...item, pageName: page.label})));
  const bad = dependencies.filter(item => item.status === 'Missing' || item.status === 'Inactive');
  const contextual = dependencies.filter(item => item.status === 'Contextual');
  const missingFieldMappings: string[] = [];
  for (const page of activePages) for (const component of page.components) {
    const properties = component.properties ?? {};
    const objectName = properties.objectApiName;
    const source = typeof objectName === 'string' ? objects.find(obj => obj.apiName === objectName) : undefined;
    if (!source) continue;
    for (const key of ['nameFieldApiName', 'priceFieldApiName', 'imageFieldApiName']) {
      const name = properties[key];
      if (typeof name === 'string' && name && !source.fields.some(field => field.apiName === name)) {
        missingFieldMappings.push(page.label + ' / ' + component.label + ': ' + source.apiName + '.' + name + ' does not exist.');
      }
    }
  }
  const dependencyFindings = [
    ...bad.map(item => item.pageName + ': ' + item.kind + ' ' + item.name + ' is ' + item.status.toLowerCase() + '.'),
    ...missingFieldMappings,
    ...contextual.map(item => item.pageName + ': ' + item.name + ' requires runtime context.')
  ];
  add({
    id: 'bindings', title: 'Component and Flow bindings',
    level: bad.length || missingFieldMappings.length ? 'action' : !dependencies.length || contextual.length ? 'review' : 'configured',
    detail: dependencies.length + ' page dependency reference(s) inspected; this does not execute a Flow.',
    findings: dependencyFindings.length ? dependencyFindings : ['No missing references detected in the inspected page metadata; verify Flow execution separately.'],
    destination: 'flow-builder'
  });

  add({
    id: 'security', title: 'OneEngine access',
    level: 'review', detail: 'Effective permissions are not proved by page metadata.',
    findings: ['Test assigned tenant roles against Objects, Fields, Records, Pages, Actions, Flows and installation entitlements.'],
    destination: 'rbac'
  });
  add({
    id: 'integrations', title: 'Integrations and state',
    level: 'review', detail: 'External provider and shared-session health require authorised runtime testing.',
    findings: ['Verify Named Credentials, actual provider responses and cross-device session isolation only where the application needs them.'],
    destination: 'app-exchange'
  });
  add({
    id: 'release', title: 'Operational launch',
    level: 'review', detail: 'No end-to-end runtime evidence is supplied by this metadata review.',
    findings: ['Test the installed app with a normal user, persist a complete transaction, exercise failures and verify recovery.']
  });
  return checks;
}
