import { IntegrationOutbox } from '../connector-outbox.js';
import { dispatchIntegrationDeliveries } from '../connector-delivery-worker.js';
import type { getRouteAliasPool } from '../postgres-state.js';

export type Delivery = Parameters<Parameters<typeof dispatchIntegrationDeliveries>[0]['dispatch']>[0];

/** Durable integration delivery loop. Caller owns tenant auth and decryption. */
export async function dispatchDueIntegrationJobsRuntime(deps: {
  persistenceMode: string;
  pool: ReturnType<typeof getRouteAliasPool>;
  tenantIds: string[];
  tenantIsActive: (tenantId: string) => boolean;
  dispatch: (tenantId: string, delivery: Delivery) => Promise<{ status: number }>;
}): Promise<void> {
  if (deps.persistenceMode === 'jsonb') return;
  if (!deps.pool) return;
  const outbox = new IntegrationOutbox(deps.pool);
  if (!await outbox.ready()) return;
  const workerId = 'metadrive-outbox-' + process.pid;
  for (const tenantId of deps.tenantIds) {
    if (!deps.tenantIsActive(tenantId)) continue;
    await dispatchIntegrationDeliveries({
      outbox, tenantId, workerId, limit: 1,
      dispatch: (delivery) => deps.dispatch(tenantId, delivery)
    });
  }
}
