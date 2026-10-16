import type { Request, Response } from "express";
import type { CredentialStatusRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerCredentialStatusRoutes(deps: CredentialStatusRoutesDependencies): void {
  deps.app.patch('/api/named-credentials/:id/enabled', deps.requirePermission('namedCredentials:manage'), (req: Request, res: Response) => {
    const parsed = deps.z.object({ enabled: deps.z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'enabled must be boolean.' });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const credential = tenant.namedCredentials.find((row) => row.id === deps.routeParam(req, 'id'));
    if (!credential) return res.status(404).json({ error: 'Named Credential was not found.' });
    if (parsed.data.enabled) {
      const entitled = deps.connectorEntitlement(tenant.records.Connector_App__c ?? [], credential);
      if (!entitled.allowed) return res.status(403).json({ error: entitled.message });
    }
    const updated = deps.namedCredentialSchema.parse({ ...credential, enabled: parsed.data.enabled, updatedAt: new Date().toISOString() });
    deps.persistTenantRecords(principal.tenantId, { ...tenant, namedCredentials: tenant.namedCredentials.map((row) => row.id === credential.id ? updated : row) });
    return res.json({ credential: deps.publicNamedCredential(updated) });
  });
  // Report credential readiness without exposing encryption keys or other tenants' data.
  deps.app.get('/api/named-credentials/readiness', deps.accessAuthentication, (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId);
    const user = deps.principalUser(principal);
    if (!tenant || !user) return res.status(403).json({ error: 'Tenant membership is no longer active' });
    const canManage = deps.effectivePermissions(user, tenant).includes('namedCredentials:manage');
    let encryptionReady = false;
    try {
      deps.credentialKeyRing();
      encryptionReady = true;
    } catch {
      // Missing or invalid encryption configuration is reported without key material.
    }
    return res.json({ canManage, encryptionReady });
  });
  deps.app.get('/api/named-credentials', deps.requireAnyPermission('metadata:read', 'namedCredentials:manage', 'connectorApps:view'), (_req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    res.json({ credentials: tenant.namedCredentials.map((credential) => {
      const managed = deps.managedConnector(tenant, credential.name);
      if (!managed || deps.connectorRight(principal, 'view')) return deps.publicNamedCredential(credential);
      // Preserve only matching identity: never leak configuration without explicit view access.
      return { id: credential.id, name: credential.name, label: '********',
        protocol: credential.protocol, baseUrl: '********', authType: credential.authType,
        headerName: '********', configuration: {}, hasSecret: false,
        enabled: false, keyId: '', updatedAt: credential.updatedAt };
    }) });
  });
}
