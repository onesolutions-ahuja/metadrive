import type { Express, Request, Response, RequestHandler } from 'express';

/** Tenant-scoped notification endpoints with persistence injected by the Core. */
export function registerNotificationRoutes<N extends { id: string; recipientId: string; createdAt: string; readAt?: string }, T extends { notifications: N[] }, P extends {tenantId: string; userId: string}>(app: Express, deps: {
  accessAuthentication: RequestHandler;
  getPrincipal: (res: Response) => P;
  tenantData: (tenantId: string) => T | undefined;
  routeParam: (req: Request, name: string) => string;
  persistTenantRecords: (tenantId: string, tenant: NoInfer<T>) => unknown;
}): void {
  const {accessAuthentication, getPrincipal, tenantData, routeParam, persistTenantRecords} = deps;
  app.get('/api/notifications', accessAuthentication, (req: Request, res: Response) => {
    const principal = getPrincipal(res);
    const tenant = tenantData(principal.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
    const notifications = tenant.notifications
      .filter((notification) => notification.recipientId === principal.userId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return res.json({ notifications, unreadCount: notifications.filter((notification) => !notification.readAt).length });
  });
  app.post('/api/notifications/:id/read', accessAuthentication, (req: Request, res: Response) => {
    const principal = getPrincipal(res);
    const tenant = tenantData(principal.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant was not found' });
    const notification = tenant.notifications.find((item) =>
      item.id === routeParam(req, 'id') && item.recipientId === principal.userId);
    if (!notification) return res.status(404).json({ error: 'Notification was not found' });
    const updated = { ...notification, readAt: notification.readAt ?? new Date().toISOString() };
    persistTenantRecords(principal.tenantId, {
      ...tenant,
      notifications: tenant.notifications.map((item) => item.id === updated.id ? updated : item)
    });
    return res.json({ notification: updated });
  });
}
