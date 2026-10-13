import type {
 DashboardMetadata, FlowDefinitionMetadata, LibraryComponentMetadata,
 LightningAppMetadata, LightningPageMetadata, ObjectMetadata, ReportMetadata
} from './metadata';

export type PageDependency = {
  kind: 'Dashboard' | 'Report' | 'Flow' | 'Object' | 'Application' | 'Component' | 'Page';
  name: string;
  componentId?: string;
  status: 'Ready' | 'Missing' | 'Inactive';
  description: string;
};

export function inspectPageDependencies(page: LightningPageMetadata, scope: {
 apps: LightningAppMetadata[];
 pages: LightningPageMetadata[];
 objects: ObjectMetadata[];
 reports: ReportMetadata[];
 dashboards: DashboardMetadata[];
 flows: FlowDefinitionMetadata[];
 libraryComponents: LibraryComponentMetadata[];
}): PageDependency[] {
 const output: PageDependency[] = [];
 const add = (kind: PageDependency['kind'], name: string, componentId: string | undefined,
   status: PageDependency['status'], description: string) =>
   output.push({kind, name, componentId, status, description});
 if (page.pageType === 'Record Page') {
   add('Object', page.targetObject, undefined,
     scope.objects.some(o=>o.apiName===page.targetObject) ? 'Ready' : 'Missing',
     'Record Page object');
 }
 for (const assignment of page.activationAssignments ?? []) {
   if (!assignment.appId) continue;
   add('Application', assignment.appId, undefined,
     scope.apps.some(app=>app.apiName===assignment.appId) ? 'Ready' : 'Missing',
     'Page activation assignment');
 }
 for (const component of page.components) {
   if (component.type === 'Dashboard') {
     const name = String(component.properties.dashboardApiName ?? '');
     const dashboard = scope.dashboards.find(x=>x.apiName===name);
     add('Dashboard', name || '(unassigned)', component.id,
       !dashboard ? 'Missing' : dashboard.status === 'Deployed' ? 'Ready' : 'Inactive',
       'Embedded dashboard');
   }
   if (component.type === 'Report Chart') {
     const name = String(component.properties.reportApiName ?? '');
     add('Report', name || '(unassigned)', component.id,
       scope.reports.some(x=>x.apiName===name) ? 'Ready' : 'Missing', 'Report chart data source');
   }
   if (component.type.startsWith('Custom:')) {
     const name=component.type.slice(7);
     const def=scope.libraryComponents.find(x=>x.apiName===name && x.surfaces.includes('page'));
     add('Component', name, component.id,
       !def ? 'Missing' : def.status === 'Draft' ? 'Inactive' : 'Ready',
       'Reusable component registry');
   }
   const flows=component.properties.actionFlows;
   if (!flows || typeof flows!=='object' || Array.isArray(flows)) continue;
   for(const [event, raw] of Object.entries(flows)) {
     if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
     const binding=raw as Record<string,unknown>;
     if(binding.actionType==='Navigate') {
       const type=String(binding.targetType ?? '');
       const target=String(binding.pageApiName ?? binding.objectApiName ?? '');
       if(type==='App Page' && target) add('Page',target,component.id,
         scope.pages.some(p=>p.apiName===target && p.status==='Active')?'Ready':'Missing',
         'Event '+event+' navigation destination');
       continue;
     }
     const name=String(binding.flowApiName ?? '');
     if(!name)continue;
     const definition=scope.flows.find(x=>x.apiName===name);
     add('Flow',name,component.id,
       !definition?'Missing':definition.status==='Active'?'Ready':'Inactive',
       'Component event: '+event);
   }
 }
 return output;
}
