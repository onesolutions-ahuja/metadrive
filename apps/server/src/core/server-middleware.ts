import cors from 'cors';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import { performance } from 'node:perf_hooks';
import { mappedTenantOrigin } from '../tenant-host-routing.js';
import { persistenceMode } from '../postgres-state.js';
import type { Principal } from '../auth.js';
import type { PlatformState } from '../index.js';
type Server = typeof import('../index.js');
type MiddlewareDeps = Pick<Server, 'tenantForRequestHost' | 'tenantData' | 'appendCommunicationRecord' | 'communicationSafeUrl' | 'supportedCommunicationMethod' | 'communicationPayload' | 'communicationError'> & { app: Express; webOrigins: Set<string>; tenantHostRouting: Parameters<typeof mappedTenantOrigin>[0]; maintenanceMode: boolean; getLatestStateCommit: () => Promise<unknown> };
export function registerPlatformMiddleware(deps: MiddlewareDeps): void {
const { app, webOrigins, tenantHostRouting, tenantForRequestHost, tenantData, appendCommunicationRecord, communicationSafeUrl, supportedCommunicationMethod, communicationPayload, communicationError, maintenanceMode, getLatestStateCommit } = deps;
app.use(cors((req, callback) => {
  const origin = req.header('origin');
  let allowed = !origin || webOrigins.has(origin) || origin === 'http://localhost:4173'
    || (origin !== undefined && mappedTenantOrigin(tenantHostRouting, origin));
  if (!allowed && origin) {
    try {
      const url = new URL(origin);
      const binding = tenantForRequestHost(req);
      allowed = url.protocol === 'https:' && url.port === '' && url.hostname === req.hostname
        && url.pathname === '/' && !url.search && !url.hash
        && !url.username && !url.password && binding?.status === 'VERIFIED';
    } catch { allowed = false; }
  }
  callback(null, { origin: allowed, credentials: true, exposedHeaders: ['Server-Timing'] });
}));
app.use(express.json({ limit: '1mb', verify: (req, _res, buffer) => { (req as Request & { rawBody?: Buffer }).rawBody = Buffer.from(buffer); } }));
// Explicit maintenance barrier for Aiven cutover; no API traffic or scheduled
// dispatch may modify the DB while the in-place migration is running.

app.use((req: Request, res: Response, next: NextFunction) => {
  if (!maintenanceMode || req.path === '/health') return next();
  res.setHeader('Retry-After', '120');
  return res.status(503).json({ error: 'MetaDrive database maintenance in progress' });
});
// In all SQL modes, acknowledge API writes only after the database transaction
// commits. Otherwise a fast API response followed by restart loses records/Flows.
// Legacy JSONB response semantics remain unchanged.

app.use((req: Request, res: Response, next: NextFunction) => {
  if (persistenceMode === 'jsonb' || !req.path.startsWith('/api') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const end = res.end;
  const requestStartedAt = performance.now();
  let ending = false;
  res.end = ((...args: unknown[]) => {
    if (ending) return res;
    ending = true;
    const commit = res.locals.authSqlCommitted === true ? Promise.resolve() : getLatestStateCommit();
    const gateStartedAt = performance.now();
    void commit.then(() => {
      if (req.path === '/api/auth/login' || req.path === '/api/auth/mfa/verify' || req.path === '/api/auth/refresh' || req.path === '/api/auth/logout') {
        const waitMs = performance.now() - gateStartedAt;
        const totalMs = performance.now() - requestStartedAt;
        const preceding = String(res.getHeader('Server-Timing') ?? '');
        res.setHeader('Server-Timing', `${preceding}${preceding ? ',' : ''}commit-wait;dur=${waitMs.toFixed(1)},server-total;dur=${totalMs.toFixed(1)}`);
        console.info(`Auth path timing ${req.path}: sql-commit=${waitMs.toFixed(1)}ms total=${totalMs.toFixed(1)}ms`);
      }
      Reflect.apply(end, res, args);
    }).catch((error: unknown) => {
      console.error('MetaDrive API transaction not acknowledged:', error);
      if (res.headersSent) {
        res.destroy(error instanceof Error ? error : new Error('Database persistence failed'));
        return;
      }
      res.statusCode = 503;
      res.removeHeader('Content-Length');
      res.removeHeader('ETag');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      Reflect.apply(end, res, [JSON.stringify({ error: 'Database persistence unavailable' })]);
    });
    return res;
  }) as typeof res.end;
  next();
});
app.use((req: Request, res: Response, next: NextFunction) => {
  // Only explicitly identified external API traffic belongs in Communication Records.
  // Browser, internal automation and platform API requests must not be logged here.
  if (!req.path.startsWith('/api') || req.path.startsWith('/api/auth/') || req.get('x-metadrive-request-source') === 'web-app'
    || req.get('x-metadrive-external-api') !== 'true') return next();
  const startedAt = Date.now();
  let responseBody: unknown;
  const sendJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    responseBody = body;
    return sendJson(body);
  }) as typeof res.json;
  res.on('finish', () => {
    const principal = res.locals.principal as Principal | undefined;
    if (!principal || !tenantData(principal.tenantId)) return;
    const authorization = req.get('authorization') ?? '';
    const authType = authorization.toLowerCase().startsWith('bearer ') ? 'Bearer'
      : authorization.toLowerCase().startsWith('basic ') ? 'Basic'
        : req.get('x-api-key') ? 'API Key'
          : authorization ? 'Other' : 'None';
    const routePath = req.route?.path;
    const apiId = `${req.method} ${typeof routePath === 'string' ? routePath : req.path}`;
    const requestUrl = `${req.protocol}://${req.get('host') ?? 'localhost'}${req.originalUrl}`;
    const isCommunicationRecordsEndpoint = /^\/api\/records\/Communication_Records__c(?:\/|$)/i.test(req.path);
    try {
      appendCommunicationRecord(principal.tenantId, principal.userId, {
        apiId,
        url: communicationSafeUrl(requestUrl),
        authType,
        method: supportedCommunicationMethod(req.method),
        direction: 'Incoming',
        requestBody: isCommunicationRecordsEndpoint ? '' : communicationPayload(req.body),
        responseBody: isCommunicationRecordsEndpoint ? '' : communicationPayload(responseBody),
        status: res.statusCode,
        error: res.statusCode >= 400 ? communicationError(responseBody) : '',
        durationMs: Date.now() - startedAt
      });
    } catch (error) {
      console.error(`Failed to record incoming API request "${apiId}": ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  next();
});
}
