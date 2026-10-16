import type { Request, Response } from "express";
import type { AppsMetadataRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerAppsMetadataRoutes(deps: AppsMetadataRoutesDependencies): void {
  deps.app.get('/api/metadata/apps', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    res.json({ apps: tenant.apps
      .filter((app) => deps.canOpenApp(principal, tenant, app.apiName))
      .map((app) => ({ ...app,
        navigationItems: app.navigationItems.filter((name) => deps.canOpenTab(principal, tenant, name)),
        navigationOrder: app.navigationOrder.filter((item) => item.type !== 'Object' || deps.canOpenTab(principal, tenant, item.apiName))
      })) });
  });
  deps.app.get('/api/apps/:appApiName/home-page', deps.accessAuthentication, (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const appApiName = deps.routeParam(req, 'appApiName');
    if (!tenant.apps.some((item) => item.apiName === appApiName) || !deps.canOpenApp(principal, tenant, appApiName))
      return res.status(404).json({ error: 'Lightning app was not found' });
    const formFactor = req.query.formFactor;
    if (formFactor !== undefined && formFactor !== 'Desktop' && formFactor !== 'Phone') {
      return res.status(400).json({ error: 'Form factor must be Desktop or Phone' });
    }
    const homePage = deps.resolveActiveLightningHomePage(
      tenant,
      appApiName,
      deps.profileIdForPrincipal(principal, tenant),
      formFactor === 'Phone' ? 'Phone' : 'Desktop'
    );
    return res.json({ page: homePage ?? null });
  });
  deps.app.get('/api/apps/:appApiName/pages/:pageApiName', deps.accessAuthentication, (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const appApiName = deps.routeParam(req, 'appApiName');
    const pageApiName = deps.routeParam(req, 'pageApiName');
    const app = tenant.apps.find((item) => item.apiName === appApiName);
    if (!app || !deps.canOpenApp(principal, tenant, appApiName))
      return res.status(404).json({ error: 'Lightning app was not found' });
    if (!app.navigationPageApiNames.includes(pageApiName)) return res.status(404).json({ error: 'Lightning page is not in this app navigation' });
    const page = tenant.pages.find((item) => item.apiName === pageApiName && item.pageType === 'App Page' && item.status === 'Active');
    if (!page) return res.status(404).json({ error: 'Active App Page was not found' });
    const formFactor = req.query.formFactor;
    if (formFactor !== undefined && formFactor !== 'Desktop' && formFactor !== 'Phone') {
      return res.status(400).json({ error: 'Form factor must be Desktop or Phone' });
    }
    if (!page.devices.includes(formFactor === 'Phone' ? 'Phone' : 'Desktop')) {
      return res.status(404).json({ error: 'App Page is not available for this form factor' });
    }
    return res.json({ page });
  });
  deps.app.post('/api/metadata/apps', deps.requireAnyPermission('metadata:write', 'pages:manage'), (req: Request, res: Response) => {
    const parsed = deps.lightningAppSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid Lightning app metadata', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    if (tenant.apps.some((item) => item.apiName.toLowerCase() === parsed.data.apiName.toLowerCase())) {
      return res.status(409).json({ error: `Lightning app "${parsed.data.apiName}" already exists` });
    }
    const invalidObject = parsed.data.navigationItems.find((apiName) => !tenant.objects.some((object) => object.apiName === apiName));
    if (invalidObject) return res.status(400).json({ error: `Navigation item "${invalidObject}" is not a tenant object` });
    const invalidPage = parsed.data.navigationPageApiNames.find((pageApiName) =>
      !tenant.pages.some((page) => page.apiName === pageApiName && page.pageType === 'App Page' && page.status === 'Active'));
    if (invalidPage) return res.status(400).json({ error: `Navigation page "${invalidPage}" must be an active App Page` });
    const apps = [...tenant.apps, parsed.data];
    const nextState = { ...deps.state, tenants: { ...deps.state.tenants, [principal.tenantId]: { ...tenant, apps } } };
    deps.persistState(nextState);
    deps.state = nextState;
    return res.status(201).json({ app: parsed.data });
  });
  deps.app.put('/api/metadata/apps/:apiName', deps.requireAnyPermission('metadata:write', 'pages:manage'), (req: Request, res: Response) => {
    const apiName = deps.routeParam(req, 'apiName');
    const parsed = deps.lightningAppSchema.safeParse({ ...req.body, apiName });
    if (!parsed.success) return res.status(400).json({ error: 'Invalid Lightning app metadata', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    if (!tenant.apps.some((item) => item.apiName === apiName)) return res.status(404).json({ error: 'Lightning app was not found' });
    const invalidObject = parsed.data.navigationItems.find((item) => !tenant.objects.some((object) => object.apiName === item));
    if (invalidObject) return res.status(400).json({ error: `Navigation item "${invalidObject}" is not a tenant object` });
    const invalidPage = parsed.data.navigationPageApiNames.find((pageApiName) =>
      !tenant.pages.some((page) => page.apiName === pageApiName && page.pageType === 'App Page' && page.status === 'Active'));
    if (invalidPage) return res.status(400).json({ error: `Navigation page "${invalidPage}" must be an active App Page` });
    const previous=tenant.apps.find(item=>item.apiName===apiName);
    if(previous?.installationAppKey!==parsed.data.installationAppKey)
      return res.status(403).json({error:'AppExchange installation ownership cannot be changed by app editing'});
    const apps = tenant.apps.map((item) => item.apiName === apiName ? parsed.data : item);
    const nextState = { ...deps.state, tenants: { ...deps.state.tenants, [principal.tenantId]: { ...tenant, apps } } };
    deps.persistState(nextState);
    deps.state = nextState;
    return res.json({ app: parsed.data });
  });
  deps.app.delete('/api/metadata/apps/:apiName', deps.requireAnyPermission('metadata:write', 'pages:manage'), (req: Request, res: Response) => {
    const apiName = deps.routeParam(req, 'apiName');
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    if (!tenant.apps.some((item) => item.apiName === apiName)) return res.status(404).json({ error: 'Lightning app was not found' });
    if (tenant.pages.some((page) => page.activationAssignments?.some((assignment) => assignment.appId === apiName))) {
      return res.status(409).json({ error: 'This app is used by Lightning page activation assignments. Reassign those pages before deleting it.' });
    }
    const apps = tenant.apps.filter((item) => item.apiName !== apiName);
    const nextState = { ...deps.state, tenants: { ...deps.state.tenants, [principal.tenantId]: { ...tenant, apps } } };
    deps.persistState(nextState);
    deps.state = nextState;
    return res.status(204).end();
  });
}
