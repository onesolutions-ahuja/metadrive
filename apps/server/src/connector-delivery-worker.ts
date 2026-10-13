import { IntegrationOutbox, type ClaimedDelivery } from './connector-outbox.js';
import { CalloutFault } from './connector-reliability.js';

export type IntegrationWorkerOptions = {
  outbox: IntegrationOutbox;
  tenantId: string;
  workerId: string;
  dispatch: (delivery: ClaimedDelivery) => Promise<{ status: number }>;
  limit?: number;
};
export type IntegrationWorkerResult = { claimed: number; succeeded: number; deferred: number };
/** Native scheduler invocation: leases jobs atomically and leaves retry state in PostgreSQL. */
export async function dispatchIntegrationDeliveries(options: IntegrationWorkerOptions): Promise<IntegrationWorkerResult> {
  const jobs = await options.outbox.claim(options.tenantId, options.workerId, options.limit ?? 2, 180_000);
  const outcome: IntegrationWorkerResult = { claimed: jobs.length, succeeded: 0, deferred: 0 };
  for (const job of jobs) {
    try {
      const response = await options.dispatch(job);
      if (response.status >= 200 && response.status < 400) {
        await options.outbox.complete(options.tenantId, options.workerId, job.id, response.status);
        outcome.succeeded++;
      } else {
        const retryable = [408,425,429,500,502,503,504].includes(response.status);
        await options.outbox.fail(options.tenantId, options.workerId, job.id,
          retryable ? 'RETRYABLE_HTTP_FAILURE' : 'PERMANENT_HTTP_FAILURE',
          retryable ? Math.min(60_000, 1000 * 2 ** (job.attempts - 1)) : 0, !retryable);
        outcome.deferred++;
      }
    } catch (error) {
      const permanent = error instanceof CalloutFault && !error.retryable;
      try {
        await options.outbox.fail(options.tenantId, options.workerId, job.id,
          permanent ? 'PERMANENT_DELIVERY_FAILURE' : 'DELIVERY_FAILURE',
          permanent ? 0 : Math.min(60_000, 1000 * 2 ** (job.attempts - 1)), permanent);
      } catch {
        // Never mark a failed lease as successful. On restart it is recovered or exhausted.
      }
      outcome.deferred++;
    }
  }
  return outcome;
}
