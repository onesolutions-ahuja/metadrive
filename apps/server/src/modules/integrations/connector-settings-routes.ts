import type { Request, Response } from "express";
import type { IntegrationsConnectorSettingsRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerIntegrationsConnectorSettingsRoutes(deps: IntegrationsConnectorSettingsRoutesDependencies): void {
  deps.app.get('/api/connector-settings', deps.requirePermission('metadata:read'), (_req: Request, res: Response) => {
    const tenant = deps.tenantData(deps.getPrincipal(res).tenantId)!;
    const templates = new Map(tenant.connectorSettings.map((connector) => [connector.apiName, connector]));
    const connectorObject = tenant.objects.find((item) => item.apiName === 'UneConnector__c');
    const configurationField = connectorObject?.fields.find((field) => field.apiName === 'Configuration__c');
    const connectors = (tenant.records.UneConnector__c ?? []).map((record) => {
      const label = String(record.Name ?? 'Une Connector');
      const rawApiName = String(record.ConnectorType__c ?? label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''));
      const apiName = /^[A-Za-z][A-Za-z0-9_]*$/.test(rawApiName) ? rawApiName : 'UneConnector';
      let values: Record<string, string> = {};
      if (typeof record.Configuration__c === 'string' && record.Configuration__c) {
        let decoded: unknown;
        try {
          decoded = JSON.parse(record.Configuration__c);
        } catch {
          throw new Error(`Configuration values for "${label}" must contain valid JSON.`);
        }
        const parsedValues = deps.z.record(deps.z.string()).safeParse(decoded);
        if (!parsedValues.success) throw new Error(`Configuration values for "${label}" must be a JSON object of string values.`);
        values = parsedValues.data;
      }
      const fieldsByName = new Map((templates.get(apiName)?.fields ?? []).map((field) => [field.apiName, field]));
      const fields = Object.entries(values).map(([fieldApiName, value]) => ({
        apiName: fieldApiName,
        label: fieldsByName.get(fieldApiName)?.label ?? fieldApiName.replace(/([a-z0-9])([A-Z])/g, '$1 $2'),
        value
      }));
      for (const field of templates.get(apiName)?.fields ?? []) {
        if (!fieldsByName.has(field.apiName) || !values[field.apiName]) {
          if (!fields.some((entry) => entry.apiName === field.apiName)) fields.push({ ...field, value: values[field.apiName] ?? '' });
        }
      }
      return deps.connectorSettingsSchema.parse({ apiName, label, fields });
    });
    if (!configurationField) throw new Error('Une Connectors object is missing its Configuration Values field.');
    res.json({ connectors });
  });
  deps.app.put('/api/connector-settings/:apiName', deps.requireAnyPermission('metadata:write', 'namedCredentials:manage'), (req: Request, res: Response) => {
    const parsed = deps.connectorSettingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid connector settings', details: parsed.error.flatten() });
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const apiName = deps.routeParam(req, 'apiName');
    const existing = (tenant.records.UneConnector__c ?? []).find((record) => record.ConnectorType__c === apiName);
    if (!existing) return res.status(404).json({ error: 'Connector settings record was not found' });
    if (parsed.data.apiName !== apiName || parsed.data.label !== existing.Name) {
      return res.status(400).json({ error: 'Connector name and type cannot be changed in connector settings' });
    }
    const configuration = Object.fromEntries(parsed.data.fields.map((field) => [field.apiName, field.value]));
    const now = new Date().toISOString();
    const updatedRecord = deps.stampRecordAuditFields({
      ...existing,
      Configuration__c: JSON.stringify(configuration),
      Status__c: parsed.data.fields.some((field) => field.value.trim()) ? 'Configured' : 'Not Configured',
      LastModifiedDate: now
    }, principal.userId, now, existing);
    const updatedTenant = {
      ...tenant,
      connectorSettings: tenant.connectorSettings.some((item) => item.apiName === apiName)
        ? tenant.connectorSettings.map((item) => item.apiName === apiName ? parsed.data : item)
        : [...tenant.connectorSettings, parsed.data],
      records: {
        ...tenant.records,
        UneConnector__c: tenant.records.UneConnector__c.map((record) => record.Id === existing.Id ? updatedRecord : record)
      }
    };
    deps.persistTenantRecords(principal.tenantId, updatedTenant);
    return res.json({ connector: parsed.data });
  });
}
