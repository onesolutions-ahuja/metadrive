import type { Request, Response } from "express";
import type { IntegrationsConnectorAppRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerIntegrationsConnectorAppRoutes(deps: IntegrationsConnectorAppRoutesDependencies): void {
  deps.app.get('/api/connector-apps/catalog', deps.accessAuthentication, (_req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    if (!deps.connectorRight(principal, 'view')) return res.status(403).json({ error: 'Missing connectorApps:view permission.' });
    const tenant = deps.tenantData(principal.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found.' });
    const current = deps.ensureConnectorAppRecords(tenant.records.Connector_App__c, principal.userId);
    // The default catalogue is refreshed during state loading. This read path is
    // also resilient when tenant upgrades were seeded before the latest packages.
    return res.json({ records: current });
  });
  deps.app.get('/api/connector-apps/capabilities', deps.accessAuthentication, (_req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    res.json({
      view: deps.connectorRight(principal, 'view'),
      edit: deps.connectorRight(principal, 'edit'),
      secrets: deps.connectorRight(principal, 'secrets'),
      test: deps.connectorRight(principal, 'test'),
      install: deps.connectorRight(principal, 'install'),
      licence: principal.permissions.includes('licence:manage')
    });
  });
  // A platform licence operator explicitly grants or renews a paid term.
  // This endpoint never processes payment and is deliberately distinct from trial activation.
  deps.app.post('/api/connector-apps/:appKey/licence', deps.accessAuthentication, deps.requirePermission('licence:manage'), (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const key = deps.routeParam(req, 'appKey');
    const matches = (tenant.records.Connector_App__c ?? []).filter((row) => row.AppKey__c === key);
    if (matches.length > 1) return res.status(409).json({ error: 'Conflicting AppExchange installation records.' }); const previous = matches[0]; if (!previous) return res.status(404).json({ error: 'Connector not found' });
    if (previous.Installed__c !== true) return res.status(409).json({ error: 'Install the connector before granting a licence.' });
    const days = Number(previous.LicenceTermDays__c ?? 30);
    if (!Number.isInteger(days) || days < 1 || days > 365) return res.status(422).json({ error: 'Invalid licence term metadata.' });
    const now = new Date();
    const priorExpiry = Date.parse(String(previous.LicenceExpiresAt__c ?? ''));
    const from = Number.isFinite(priorExpiry) && priorExpiry > now.getTime() ? priorExpiry : now.getTime();
    const expiresAt = new Date(from + days * 86400000).toISOString();
    const next = deps.applyConnectorLifecycle(previous, { ...previous, LicenceExpiresAt__c: expiresAt },
      tenant.namedCredentials, tenant.flows, now, true);
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant, records: {
        ...tenant.records,
        Connector_App__c: tenant.records.Connector_App__c.map((row) => row.Id === previous.Id ? next : row)
      }
    });
    return res.json({ app: next });
  });
  // Enabling is separate from saving configuration. Installation and valid entitlement are mandatory.
  deps.app.patch('/api/connector-apps/:appKey/credential-enabled', deps.accessAuthentication, (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    if (!principal.permissions.includes('namedCredentials:manage')) return res.status(403).json({ error: 'Only Named Credential administrators can change activation.' });
    const parsed = deps.z.object({ enabled: deps.z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'enabled must be boolean.' });
    const tenant = deps.tenantData(principal.tenantId)!;
    const matches = (tenant.records.Connector_App__c ?? []).filter((row) => row.AppKey__c === deps.routeParam(req, 'appKey'));
    if (matches.length > 1) return res.status(409).json({ error: 'Conflicting AppExchange installation records.' });
    const appRecord = matches[0];
    if (!appRecord) return res.status(404).json({ error: 'Connector not found.' });
    const credential = tenant.namedCredentials.find((row) => row.name === appRecord.CredentialName__c);
    if (!credential) return res.status(404).json({ error: 'Configure the connection first.' });
    if (parsed.data.enabled) {
      const entitled = deps.connectorEntitlement(tenant.records.Connector_App__c ?? [], credential);
      if (!entitled.allowed) return res.status(403).json({ error: entitled.message });
    }
    const updated = deps.namedCredentialSchema.parse({ ...credential, enabled: parsed.data.enabled, updatedAt: new Date().toISOString() });
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant, namedCredentials: tenant.namedCredentials.map((row) => row.id === credential.id ? updated : row)
    });
    return res.json({ credential: deps.publicNamedCredential(updated) });
  });
}
