import type { Express, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import type { TenantData } from '../../index.js';

export function registerConnectorSettingsReadRoute<P extends {tenantId: string}>(app: Express, deps: {
  requirePermission: (permission: string) => RequestHandler;
  getPrincipal: (res: Response) => P;
  tenantData: (tenantId: string) => TenantData | undefined;
  connectorSettingsSchema: {parse: (value: unknown) => unknown};
}): void {
  const { requirePermission, getPrincipal, tenantData, connectorSettingsSchema } = deps;
  app.get('/api/connector-settings', requirePermission('metadata:read'), (_req: Request, res: Response) => {
    const tenant = tenantData(getPrincipal(res).tenantId)!;
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
        const parsedValues = z.record(z.string()).safeParse(decoded);
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
      return connectorSettingsSchema.parse({ apiName, label, fields });
    });
    if (!configurationField) throw new Error('Une Connectors object is missing its Configuration Values field.');
    res.json({ connectors });
  });
}
