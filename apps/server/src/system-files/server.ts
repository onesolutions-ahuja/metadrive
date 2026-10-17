import express, { type NextFunction, type Request, type Response } from 'express';
import { SqlPersistence } from './sql-persistence.js';
import { AuthenticationService } from './authentication.js';
import { ObjectDefinitionService } from './object-definition.js';
import { RbacEngine } from './rbac-engine.js';
import { RecordEngine } from './record-engine.js';

type AuthenticatedRequest = Request & { actor?: { tenant_id: string; user_id: string } };
type Handler = (req: AuthenticatedRequest, res: Response) => Promise<unknown>;
function asyncRoute(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req as AuthenticatedRequest, res)).catch(next);
  };
}
export function createSystemServer(db: SqlPersistence) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  const auth = new AuthenticationService(db);
  const rbac = new RbacEngine(db);
  const records = new RecordEngine(db, rbac);
  const definitions = new ObjectDefinitionService(db);

  const requireSession = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const value = req.get('authorization') ?? '';
      if (!/^Bearer [a-zA-Z0-9_-]+$/.test(value)) {
        res.status(401).json({ error: 'Bearer token required' }); return;
      }
      req.actor = await auth.authenticate(value.slice(7));
      next();
    } catch {
      res.status(401).json({ error: 'Invalid session' });
    }
  };
  app.get('/api/health', asyncRoute(async (_req, res) => {
    await db.query('SELECT 1 FROM md_tenants LIMIT 1');
    res.json({ status: 'ok', persistence: 'sql' });
  }));
  app.post('/api/auth/login', asyncRoute(async (req, res) => {
    const { tenantSlug, email, password } = req.body ?? {};
    if (typeof tenantSlug !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ error: 'Tenant, email and password required' }); return;
    }
    const { rows } = await db.query<{ id: string }>('SELECT id FROM md_tenants WHERE slug=$1', [tenantSlug]);
    if (!rows[0]) { res.status(401).json({ error: 'Invalid credentials' }); return; }
    try {
      const session = await auth.signIn(rows[0].id, email, password);
      res.json({ access_token: session.accessToken, expires_in: session.expiresIn });
    } catch { res.status(401).json({ error: 'Invalid credentials' }); }
  }));
  app.use('/api', requireSession);
  app.get('/api/auth/me', asyncRoute(async (req, res) => { res.json({ userId: req.actor!.user_id, tenantId: req.actor!.tenant_id }); }));
  app.post('/api/auth/logout', asyncRoute(async (req, res) => {
    const bearer = req.get('authorization')!;
    await auth.signOut(bearer.slice(7));
    res.status(204).end();
  }));
  app.get('/api/objects', asyncRoute(async (req, res) => {
    const actor = req.actor!;
    await rbac.require(actor.tenant_id, actor.user_id, 'ObjectDefinition', 'read');
    res.json({ objects: await definitions.list(actor.tenant_id) });
  }));
  app.get('/api/records/:objectApi', asyncRoute(async (req, res) => {
    const actor = req.actor!;
    const rawLimit = Number(req.query.limit ?? 50);
    const rawOffset = Number(req.query.offset ?? 0);
    if (!Number.isInteger(rawLimit) || !Number.isInteger(rawOffset)) {
      res.status(400).json({ error: 'Invalid pagination' }); return;
    }
    res.json({ records: await records.list(actor.tenant_id, actor.user_id, req.params.objectApi, rawLimit, rawOffset) });
  }));
  app.post('/api/records/:objectApi', asyncRoute(async (req, res) => {
    const actor = req.actor!;
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ error: 'Record fields required' }); return;
    }
    const id = await records.create(actor.tenant_id, actor.user_id, req.params.objectApi, req.body);
    res.status(201).json({ id });
  }));
  app.patch('/api/records/:objectApi/:id', asyncRoute(async (req, res) => {
    const actor = req.actor!;
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
      res.status(400).json({ error: 'Record fields required' }); return;
    }
    await records.update(actor.tenant_id, actor.user_id, req.params.objectApi, req.params.id, req.body);
    res.status(204).end();
  }));
  app.delete('/api/records/:objectApi/:id', asyncRoute(async (req, res) => {
    const actor = req.actor!;
    await records.remove(actor.tenant_id, actor.user_id, req.params.objectApi, req.params.id);
    res.status(204).end();
  }));
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err.message === 'Permission denied') res.status(403).json({ error: 'Permission denied' });
    else if (err.message === 'Record not found') res.status(404).json({ error: 'Record not found' });
    else if (err.message.startsWith('Invalid ') || err.message.startsWith('Unknown field')) res.status(400).json({ error: err.message });
    else { console.error('System runtime request failed:', err); res.status(503).json({ error: 'SQL service unavailable' }); }
  });
  return app;
}
export async function startSystemServer() {
  const db = new SqlPersistence(process.env.DATABASE_URL ?? '');
  await db.query('SELECT 1 FROM md_tenants LIMIT 1');
  const port = Number(process.env.PORT ?? 10000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  return createSystemServer(db).listen(port, '0.0.0.0');
}
