import { createPlatformScheduler } from './platform-scheduler.js';
import { createIntegrationDeliveryHandler } from './integration-delivery.js';
import { createSqlStateRefresh } from '../core/state/refresh.js';

type SchedulerDeps = Parameters<typeof createPlatformScheduler>[0];
type IntegrationHandlerDeps = Parameters<typeof createIntegrationDeliveryHandler>[0];
type StateRefreshDeps = Parameters<typeof createSqlStateRefresh>[0];

/** One owner for lifecycle composition; individual jobs remain in the shared scheduler. */
export function createSchedulerRuntime(deps: Omit<SchedulerDeps, 'refresh' | 'integration'> & {
 refresh: StateRefreshDeps;
 integrationHandler: IntegrationHandlerDeps;
 integration: Omit<SchedulerDeps['integration'], 'dispatch'>;
}): () => Promise<void> {
 const { refresh, integrationHandler, integration, ...rest } = deps;
 return createPlatformScheduler({
  ...rest,
  refresh: createSqlStateRefresh(refresh),
  integration: { ...integration, dispatch: createIntegrationDeliveryHandler(integrationHandler) }
 });
}
