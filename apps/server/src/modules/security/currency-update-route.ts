import type { Express, Request, Response, RequestHandler } from 'express';
import type { TenantData, getPrincipal as getPrincipalSignature } from '../../index.js';
import type { z } from 'zod';

type Principal = ReturnType<typeof getPrincipalSignature>;
export function registerCurrencyUpdateRoute(app: Express, deps: {
  requirePermission: (permission: string) => RequestHandler;
  getPrincipal: (res: Response) => Principal;
  tenantData: (tenantId: string) => TenantData | undefined;
  schema: { safeParse: (input: unknown) => z.SafeParseReturnType<unknown, TenantData['currencySettings']> };
  persistTenantRecords: (tenantId: string, data: TenantData) => void;
}): void {
  const { requirePermission, getPrincipal, tenantData, schema, persistTenantRecords } = deps;
  app.put('/api/metadata/currencies', requirePermission('security:manage'), (req: Request, res: Response) => {
    const principal = getPrincipal(res);
    const tenant = tenantData(principal.tenantId)!;
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid currency settings', details: parsed.error.flatten() });
    const activeCurrencyCodes = new Set(parsed.data.currencies.map((currency) => currency.currencyIsoCode));
    const userWithUnavailableCurrency = tenant.accessControl.users.find((user) =>
      user.currencyIsoCode && !activeCurrencyCodes.has(user.currencyIsoCode));
    if (userWithUnavailableCurrency) {
      return res.status(409).json({
        error: `Currency "${userWithUnavailableCurrency.currencyIsoCode}" is assigned to user "${userWithUnavailableCurrency.username}" and cannot be deactivated`
      });
    }
    const recordWithUnavailableCurrency = Object.entries(tenant.records).find(([objectApiName, records]) =>
      tenant.objects.some((object) => object.apiName === objectApiName
        && object.fields.some((field) => /^Currency(?:\(|$)/.test(field.dataType)))
      && records.some((record) => typeof record.CurrencyIsoCode === 'string'
        && !activeCurrencyCodes.has(record.CurrencyIsoCode)));
    if (recordWithUnavailableCurrency) {
      const record = recordWithUnavailableCurrency[1].find((item) =>
        typeof item.CurrencyIsoCode === 'string' && !activeCurrencyCodes.has(item.CurrencyIsoCode));
      return res.status(409).json({
        error: `Currency "${String(record?.CurrencyIsoCode)}" is assigned to ${recordWithUnavailableCurrency[0]} record "${String(record?.Id)}" and cannot be deactivated`
      });
    }
    const updatedTenant = { ...tenant, currencySettings: parsed.data };
    persistTenantRecords(principal.tenantId, updatedTenant);
    return res.json(parsed.data);
  });
}
