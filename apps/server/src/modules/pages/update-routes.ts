import type { Request, Response } from "express";
import type { PageUpdateRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerPageUpdateRoutes(deps: PageUpdateRoutesDependencies): void {
  deps.app.put('/api/metadata/pages/:apiName', deps.requireAnyPermission('metadata:write', 'pages:manage'), (req: Request, res: Response) => {
    const previousApiName = deps.routeParam(req, 'apiName');
    const requestedApiName = typeof req.body?.apiName === 'string' ? req.body.apiName : previousApiName;
    const parsed = deps.pageSchema.safeParse({ ...req.body, apiName: requestedApiName });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid Lightning page metadata', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const existingPage = tenant.pages.find((page) => page.apiName === previousApiName);
    const protectedError = deps.validateProtectedAdministrationPageUpdate(existingPage,parsed.data,principal.permissions);
    if (protectedError) return res.status(403).json({error:protectedError});
    if (tenant.pages.some((page) => page.apiName.toLocaleLowerCase() === parsed.data.apiName.toLocaleLowerCase()
      && page.apiName !== previousApiName)) {
      return res.status(409).json({ error: `A Lightning page named "${parsed.data.apiName}" already exists` });
    }
    if (parsed.data.status === 'Active') {
      const invalidDashboard = parsed.data.components.find(component => component.type === 'Dashboard'
        && (typeof component.properties.dashboardApiName !== 'string'
          || !tenant.dashboards.some(dashboard => dashboard.apiName === component.properties.dashboardApiName
            && dashboard.status === 'Deployed' && deps.canAccessDashboard(
              deps.dashboardForUser(tenant, dashboard, principal.userId), principal.userId,
              tenant.accessControl.users.find(user => user.id === principal.userId)?.permissionSetGroupIds ?? [],
              principal.permissions.includes('dashboards:manage')))));
      if (invalidDashboard) return res.status(422).json({
        error: 'An active Lightning page can embed only a published dashboard accessible to the editor'
      });
    }
    const invalidLibraryComponent = parsed.data.components.find((component) => component.type.startsWith('Custom:') && !deps.state.libraryComponents.some((libraryComponent) =>
      libraryComponent.apiName === component.type.slice('Custom:'.length) && libraryComponent.surfaces.includes('page')
      && deps.libraryComponentVisible(libraryComponent, principal.tenantId, Object.keys(deps.state.tenants))));
    if (invalidLibraryComponent) return res.status(422).json({ error: `Custom page component "${invalidLibraryComponent.type.slice('Custom:'.length)}" is not available in the component library` });
    const invalidApp = parsed.data.activationAssignments?.find((assignment) => assignment.appId
      && !tenant.apps.some((app) => app.apiName === assignment.appId));
    if (invalidApp) return res.status(400).json({ error: `Activation assignment references unknown app "${invalidApp.appId}"` });
    const invalidProfile = parsed.data.activationAssignments?.find((assignment) => assignment.profileId
      && !tenant.accessControl.profiles.some((profile) => profile.id === assignment.profileId));
    if (invalidProfile) return res.status(400).json({ error: `Activation assignment references unknown profile "${invalidProfile.profileId}"` });
    if (parsed.data.pageType === 'Home Page') {
      const invalidScope = parsed.data.activationAssignments?.find((assignment) =>
        !['App Default', 'App and Profile'].includes(assignment.scope));
      if (invalidScope) return res.status(400).json({ error: 'Home Pages must use App Default or App and Profile assignments' });
      if (parsed.data.status === 'Active' && !parsed.data.activationAssignments?.length) {
        return res.status(422).json({ error: 'An active Home Page requires at least one app assignment' });
      }
      if (parsed.data.status === 'Active') {
        const unsupportedFormFactor = parsed.data.activationAssignments?.find((assignment) =>
          assignment.formFactors.some((formFactor) => !parsed.data.devices.includes(formFactor)));
        if (unsupportedFormFactor) return res.status(400).json({ error: 'Activation form factors must be supported by the page' });
        const conflictingAssignment = tenant.pages
          .filter((page) => page.apiName !== previousApiName && page.status === 'Active' && page.pageType === 'Home Page')
          .flatMap((page) => page.activationAssignments ?? [])
          .find((existing) => parsed.data.activationAssignments?.some((assignment) =>
            assignment.scope === existing.scope
            && assignment.appId === existing.appId
            && assignment.profileId === existing.profileId
            && assignment.formFactors.some((formFactor) => existing.formFactors.includes(formFactor))));
        if (conflictingAssignment) {
          return res.status(409).json({ error: `An active Home Page already has a matching ${conflictingAssignment.scope} assignment` });
        }
      }
    }
    if (parsed.data.pageType === 'Record Page') {
      const targetObject = tenant.objects.find((object) => object.apiName === parsed.data.targetObject);
      if (!targetObject) return res.status(400).json({ error: `Target object "${parsed.data.targetObject}" does not exist` });
      const invalidDynamicField = parsed.data.components.find((component) => {
        if (component.type === 'Record Field') {
          return typeof component.properties.fieldApiName !== 'string'
            || !targetObject.fields.some((field) => field.apiName === component.properties.fieldApiName);
        }
        if (component.type === 'Field Section') {
          const fieldApiNames = component.properties.fieldApiNames;
          return !Array.isArray(fieldApiNames)
            || fieldApiNames.some((fieldApiName) => typeof fieldApiName !== 'string'
              || !targetObject.fields.some((field) => field.apiName === fieldApiName))
            || new Set(fieldApiNames).size !== fieldApiNames.length;
        }
        return false;
      });
      if (invalidDynamicField) return res.status(400).json({ error: `Dynamic Forms component "${invalidDynamicField.label}" references an invalid or duplicate field` });
      const unsupportedFormFactor = parsed.data.activationAssignments?.find((assignment) =>
        assignment.formFactors.some((formFactor) => !parsed.data.devices.includes(formFactor)));
      if (unsupportedFormFactor) return res.status(400).json({ error: 'Activation form factors must be supported by the page' });
      const unsupportedComponent = parsed.data.components.find((component) =>
        (component.type === 'Activities' && !targetObject.settings?.allowActivities)
        || (component.type === 'Chatter' && !targetObject.settings?.allowInChatter)
        || (component.type === 'Report Chart' && !targetObject.settings?.allowReports));
      if (unsupportedComponent) return res.status(422).json({ error: `The "${unsupportedComponent.type}" component requires its corresponding object feature to be enabled` });
      if (parsed.data.status === 'Active' && !parsed.data.activationAssignments?.length) {
        return res.status(422).json({ error: 'An active record page requires at least one activation assignment' });
      }
      const invalidRecordType = parsed.data.activationAssignments?.find((assignment) => assignment.recordTypeId && !targetObject.recordTypes?.some((recordType) => recordType.id === assignment.recordTypeId));
      if (invalidRecordType) return res.status(400).json({ error: `Record type "${invalidRecordType.recordTypeId}" does not exist on "${targetObject.label}"` });
      if (parsed.data.status === 'Active') {
        const conflictingAssignment = tenant.pages
          .filter((page) => page.apiName !== previousApiName && page.status === 'Active'
            && page.pageType === 'Record Page' && page.targetObject === parsed.data.targetObject)
          .flatMap((page) => page.activationAssignments ?? [])
          .find((existing) => parsed.data.activationAssignments?.some((assignment) =>
            assignment.scope === existing.scope
            && assignment.appId === existing.appId
            && assignment.profileId === existing.profileId
            && assignment.recordTypeId === existing.recordTypeId
            && assignment.formFactors.some((formFactor) => existing.formFactors.includes(formFactor))));
        if (conflictingAssignment) {
          return res.status(409).json({ error: `An active page already has a matching ${conflictingAssignment.scope} assignment for "${parsed.data.targetObject}"` });
        }
      }
    }
    if (existingPage?.pageType === 'App Page'
      && (parsed.data.pageType !== 'App Page' || parsed.data.status !== 'Active')
      && tenant.apps.some((app) => app.navigationPageApiNames.includes(previousApiName))) {
      return res.status(409).json({ error: 'Remove this page from app navigation before deactivating or changing its type' });
    }
    const apps = parsed.data.apiName === previousApiName ? tenant.apps : tenant.apps.map((app) => ({
      ...app,
      navigationPageApiNames: app.navigationPageApiNames.map((apiName) => apiName === previousApiName ? parsed.data.apiName : apiName),
      navigationOrder: app.navigationOrder.map((item) =>
        item.type === 'App Page' && item.apiName === previousApiName
          ? { ...item, apiName: parsed.data.apiName }
          : item)
    }));
    const updatedTenant = {
      ...tenant,
      apps,
      pages: [...tenant.pages.filter((page) => page.apiName !== previousApiName), {
        ...parsed.data,
        updatedAt: new Date().toISOString()
      }]
    };
    const nextState = { ...deps.state, tenants: { ...deps.state.tenants, [principal.tenantId]: updatedTenant } };
    deps.persistState(nextState);
    deps.state = nextState;
    return res.json({ page: updatedTenant.pages[updatedTenant.pages.length - 1] });
  });
}
