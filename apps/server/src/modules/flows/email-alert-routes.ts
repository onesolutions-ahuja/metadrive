import type { Request, Response } from "express";
import type { FlowsEmailAlertRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerFlowsEmailAlertRoutes(deps: FlowsEmailAlertRoutesDependencies): void {
  deps.app.get('/api/metadata/email-alerts', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    res.json({ emailAlerts: deps.tenantData(deps.getPrincipal(res).tenantId)?.emailAlerts ?? [] });
  });
  deps.app.post('/api/metadata/email-alerts', deps.requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
    const parsed = deps.emailAlertRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid Email Alert', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    if (tenant.emailAlerts.some((alert) => alert.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return res.status(409).json({ error: `Email Alert "${parsed.data.name}" already exists` });
    }
    const object = tenant.objects.find((candidate) => candidate.apiName === parsed.data.objectApiName);
    if (!object) return res.status(400).json({ error: `Email Alert object "${parsed.data.objectApiName}" does not exist` });
    const credential = tenant.namedCredentials.find((candidate) =>
      candidate.id === parsed.data.namedCredentialId && candidate.protocol === 'SMTP');
    if (!credential) return res.status(400).json({ error: 'Email Alert requires an SMTP Named Credential' });
    const recipients = parsed.data.recipients.split(/[;,]/).map((recipient) => recipient.trim()).filter(Boolean);
    if (!recipients.length || recipients.some((recipient) =>
      !recipient.includes('{') && !deps.z.string().email().safeParse(recipient).success)) {
      return res.status(400).json({ error: 'Email Alert requires valid recipient addresses or Flow record references' });
    }
    const now = new Date().toISOString();
    const emailAlert = deps.emailAlertSchema.parse({ ...parsed.data, id: deps.randomUUID(), createdAt: now, updatedAt: now });
    deps.persistTenantRecords(principal.tenantId, { ...tenant, emailAlerts: [...tenant.emailAlerts, emailAlert] });
    return res.status(201).json({ emailAlert });
  });
  deps.app.put('/api/metadata/email-alerts/:id', deps.requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
    const parsed = deps.emailAlertRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid Email Alert', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const existing = tenant.emailAlerts.find((alert) => alert.id === deps.routeParam(req, 'id'));
    if (!existing) return res.status(404).json({ error: 'Email Alert was not found' });
    if (tenant.emailAlerts.some((alert) =>
      alert.id !== existing.id && alert.name.toLowerCase() === parsed.data.name.toLowerCase())) {
      return res.status(409).json({ error: `Email Alert "${parsed.data.name}" already exists` });
    }
    if (!tenant.objects.some((candidate) => candidate.apiName === parsed.data.objectApiName)) {
      return res.status(400).json({ error: `Email Alert object "${parsed.data.objectApiName}" does not exist` });
    }
    if (!tenant.namedCredentials.some((candidate) =>
      candidate.id === parsed.data.namedCredentialId && candidate.protocol === 'SMTP')) {
      return res.status(400).json({ error: 'Email Alert requires an SMTP Named Credential' });
    }
    const recipients = parsed.data.recipients.split(/[;,]/).map((recipient) => recipient.trim()).filter(Boolean);
    if (!recipients.length || recipients.some((recipient) =>
      !recipient.includes('{') && !deps.z.string().email().safeParse(recipient).success)) {
      return res.status(400).json({ error: 'Email Alert requires valid recipient addresses or Flow record references' });
    }
    const emailAlert = deps.emailAlertSchema.parse({ ...parsed.data, id: existing.id, createdAt: existing.createdAt, updatedAt: new Date().toISOString() });
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant, emailAlerts: tenant.emailAlerts.map((alert) => alert.id === emailAlert.id ? emailAlert : alert)
    });
    return res.json({ emailAlert });
  });
  deps.app.delete('/api/metadata/email-alerts/:id', deps.requireAnyPermission('metadata:write', 'flows:manage'), (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const id = deps.routeParam(req, 'id');
    const emailAlert = tenant.emailAlerts.find((alert) => alert.id === id);
    if (!emailAlert) return res.status(404).json({ error: 'Email Alert was not found' });
    const references = tenant.flows.flatMap((flow) => flow.elements
      .filter((element) => element.type === 'Action' && element.config.actionType === 'Email Alert'
        && element.config.emailAlertId === id)
      .map((element) => `${flow.label} / ${element.label}`));
    if (references.length) return res.status(409).json({ error: `Email Alert is in use by: ${references.join(', ')}` });
    deps.persistTenantRecords(principal.tenantId, {
      ...tenant, emailAlerts: tenant.emailAlerts.filter((alert) => alert.id !== id)
    });
    return res.status(204).end();
  });
}
