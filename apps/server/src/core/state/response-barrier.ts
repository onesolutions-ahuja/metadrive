import type { Request, Response, NextFunction } from 'express';
import { performance } from 'node:perf_hooks';

/** Delay write acknowledgements until their SQL commit succeeds. */
export function createPersistenceResponseBarrier(deps: { persistenceMode: string; readonly latestCommit: Promise<unknown> }) {
  return (req: Request, res: Response, next: NextFunction) => {
  if (deps.persistenceMode === 'jsonb' || !req.path.startsWith('/api') || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const end = res.end;
  const requestStartedAt = performance.now();
  let ending = false;
  res.end = ((...args: unknown[]) => {
    if (ending) return res;
    ending = true;
    const commit = res.locals.authSqlCommitted === true ? Promise.resolve() : deps.latestCommit;
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
};
}
