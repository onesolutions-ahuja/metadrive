export type StartupHooks = {
  syncComponents: () => Promise<unknown>;
  dispatchScheduledFlows: () => Promise<unknown>;
};

/** Keep scheduler startup and error handling in one reusable place. */
export function startPlatformServer(options: {
  app: { listen: (port: number, callback: () => void) => unknown };
  port: number;
  issuer: string;
  maintenanceMode: boolean;
  schedulePollInterval: number;
  hooks: StartupHooks;
}): void {
  const { app, port, issuer, maintenanceMode, schedulePollInterval, hooks } = options;
  app.listen(port, () => {
    console.log(`MetaDrive API listening on http://localhost:${port} (JWT issuer: ${issuer})`);
    if (!maintenanceMode) void hooks.syncComponents().catch((error: unknown) => console.error('Startup Core component registration failed', error));
    void hooks.dispatchScheduledFlows().catch((error: unknown) => console.error('Scheduled flow dispatcher failed', error));
    setInterval(() => {
      void hooks.dispatchScheduledFlows().catch((error: unknown) => console.error('Scheduled flow dispatcher failed', error));
    }, schedulePollInterval);
  });
}
