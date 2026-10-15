import type { Express } from 'express';

/** Authentication discovery and Railway-compatible health endpoint. */
export function registerHealthAndDiscoveryRoutes(app: Express, deps: {
  checkDatabaseConnection: () => Promise<unknown>;
  jwtService: { config: { mode: string }; discovery: () => unknown; jwks: () => Promise<unknown> };
  maintenanceMode: boolean;
  persistenceMode: string;
}): void {
  const { checkDatabaseConnection, jwtService, maintenanceMode, persistenceMode } = deps;
  app.get('/health', async (_req, res) => {
    const database = await checkDatabaseConnection();
    return res.json({ ok: true, service: 'metadrive-api', database, authMode: jwtService.config.mode, maintenance: maintenanceMode, persistenceMode, deployedCommit: process.env.RAILWAY_GIT_COMMIT_SHA ?? process.env.RENDER_GIT_COMMIT ?? '' });
  });
  app.get('/.well-known/openid-configuration', (_req, res) => res.json(jwtService.discovery()));
  app.get('/.well-known/jwks.json', (_req, res) => { void jwtService.jwks().then((body) => res.json(body)); });
  app.get('/jwks.json', (_req, res) => { void jwtService.jwks().then((body) => res.json(body)); });
}
