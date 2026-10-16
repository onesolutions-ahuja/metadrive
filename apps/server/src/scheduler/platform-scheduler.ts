import { createScheduledDispatcher } from './dispatcher.js';
import { dispatchDueIntegrationJobsRuntime } from './integration-dispatch.js';

type DispatcherDeps = Parameters<typeof createScheduledDispatcher>[0];
type IntegrationDeps = Parameters<typeof dispatchDueIntegrationJobsRuntime>[0];
type Subscription = { id: string; active: boolean; nextRunAt: string };
type TenantSubscriptions = { dashboardSubscriptions: Subscription[] };

/** One scheduler owner for durable flows, events, integration jobs and dashboard jobs.
 * The SQL lease, refresh and persistence barriers are injected by the platform.
 * No independent timers or parallel workflow execution engines are created here.
 */
export function createPlatformScheduler(deps: Pick<DispatcherDeps, 'maintenance' | 'lease' | 'flush' | 'refresh' | 'events' | 'flows'> & {
  integration: Omit<IntegrationDeps, 'tenantIds'> & { tenantIds: () => string[] };
  subscriptions: {
    tenants: () => Record<string, TenantSubscriptions>;
    tenantIsActive: (tenantId: string) => boolean;
    dispatch: (tenantId: string, subscriptionId: string) => Promise<unknown>;
  };
}): () => Promise<void> {
  return createScheduledDispatcher({
    ...deps,
    integrations: async () => {
      await dispatchDueIntegrationJobsRuntime({
        ...deps.integration,
        tenantIds: deps.integration.tenantIds()
      });
    },
    subscriptions: async () => {
      const now = Date.now();
      const due = Object.entries(deps.subscriptions.tenants()).flatMap(([tenantId, tenant]) =>
        deps.subscriptions.tenantIsActive(tenantId)
          ? tenant.dashboardSubscriptions
              .filter(subscription => subscription.active && Date.parse(subscription.nextRunAt) <= now)
              .map(subscription => ({ tenantId, subscriptionId: subscription.id }))
          : []);
      for (const job of due) await deps.subscriptions.dispatch(job.tenantId, job.subscriptionId);
    }
  });
}
