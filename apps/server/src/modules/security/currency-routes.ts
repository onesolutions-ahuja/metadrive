import type { Request, Response } from "express";
import type { SecurityCurrencyRoutesDependencies } from '../../index.js';

/** Registers existing endpoints with live access to the shared platform services. */
export function registerSecurityCurrencyRoutes(deps: SecurityCurrencyRoutesDependencies): void {
  deps.app.get('/api/metadata/currencies', deps.requirePermission('security:read'), (_req: Request, res: Response) => {
    res.json(deps.tenantData(deps.getPrincipal(res).tenantId)!.currencySettings);
  });
  deps.app.put('/api/metadata/currencies', deps.requirePermission('security:manage'), (req: Request, res: Response) => {
    const principal = deps.getPrincipal(res);
    const tenant = deps.tenantData(principal.tenantId)!;
    const parsed = deps.currencySettingsSchema.safeParse(req.body);
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
    deps.persistTenantRecords(principal.tenantId, updatedTenant);
    return res.json(parsed.data);
  });
}
