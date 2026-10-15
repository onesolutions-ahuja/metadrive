export function createScheduledDispatcher(deps: {
  maintenance: boolean;
  lease: (callback: () => Promise<void>) => Promise<unknown>;
  flush: () => Promise<unknown>;
  refresh: () => Promise<boolean>;
  events: () => Promise<void>;
  flows: () => Promise<void>;
  integrations: () => Promise<void>;
  subscriptions: () => Promise<void>;
}): () => Promise<void> {
  let running = false;
  return async () => {
    if (deps.maintenance || running) return;
    running = true;
    try {
      await deps.lease(async () => {
        await deps.flush();
        if (!await deps.refresh()) return;
        await deps.events();
        await deps.flows();
        await deps.integrations();
        await deps.subscriptions();
        await deps.flush();
      });
    } finally {
      running = false;
    }
  };
}
