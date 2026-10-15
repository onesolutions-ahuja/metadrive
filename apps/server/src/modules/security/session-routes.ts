import { z } from 'zod';
import { activeSessionSummaries } from './active-sessions.js';
import { hashPassword, verifyPassword, type JwtService, type Principal } from '../../auth.js';
import type { Express, Request, Response, RequestHandler } from 'express';
import type { LocalUser, TenantData, PlatformState } from '../../index.js';

export function registerSessionSecurityRoutes(deps: {
  app: Express;
  accessAuthentication: RequestHandler;
  requirePermission: (permission: string) => RequestHandler;
  getPrincipal: (res: Response) => Principal;
  principalUser: (principal: Principal) => LocalUser | undefined;
  tenantData: (id: string) => TenantData | undefined;
  jwtService: JwtService;
  getState: () => PlatformState;
  setState: (state: PlatformState) => void;
  persistState: (state: PlatformState) => void;
  revokeUserRefreshSessions: (userId: string, tenantId: string) => PlatformState['refreshSessions'];
  withSecurityEvent: (tenant: TenantData, actor: string, action: string, details?: Record<string,string>, target?: string) => TenantData;
  effectivePermissions: (user: LocalUser, tenant: TenantData) => string[];
  clearRefreshCookie: (res: Response) => void;
  userLoginFailures: Map<string, {count: number; until: number}>;
}) {
  const { app, accessAuthentication, requirePermission, getPrincipal, principalUser, tenantData,
    jwtService, persistState, revokeUserRefreshSessions, withSecurityEvent,
    effectivePermissions, clearRefreshCookie, userLoginFailures } = deps;
app.get('/api/auth/sessions', accessAuthentication, (_req: Request, res: Response) => {
  const principal = getPrincipal(res);
  const now = Date.now() / 1000;
  const active = activeSessionSummaries(deps.getState().refreshSessions,
    principal.userId, principal.tenantId, now);
  // Do not expose raw refresh tokens or their hashes.
  res.json({ sessions: active });
});

// Revokes every refresh session AND every bearer token using auth-version
// invalidation. Requires password proof even when the caller holds a valid JWT.
app.post('/api/auth/sessions/revoke-all', accessAuthentication, async (req: Request, res: Response) => {
  if (jwtService.config.mode !== 'local') {
    return res.status(409).json({ error: 'Sessions are managed by the external identity provider' });
  }
  const parsed = z.object({ currentPassword: z.string().min(1).max(256) }).strict().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Current password required' });
  const principal = getPrincipal(res);
  const user = principalUser(principal);
  if (!user || !await verifyPassword(parsed.data.currentPassword, user.passwordSalt, user.passwordHash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const nextState: PlatformState = {
    ...deps.getState(),
    users: deps.getState().users.map((item) => item.id === user.id && item.tenantId === user.tenantId
      ? { ...item, authVersion: (item.authVersion ?? 0) + 1 }
      : item),
    refreshSessions: revokeUserRefreshSessions(user.id, user.tenantId),
    tenants: {
      ...deps.getState().tenants,
      [user.tenantId]: withSecurityEvent(tenantData(user.tenantId)!, user.id, 'auth.sessions.revoked-all')
    }
  };
  try { persistState(nextState); deps.setState(nextState); }
  catch { return res.status(503).json({ error: 'Unable to revoke sessions' }); }
  clearRefreshCookie(res);
  return res.json({ revoked: true, signedOut: true });
});


app.get('/api/auth/user-locks', accessAuthentication, requirePermission('security:manage'),
  (_req: Request, res: Response) => {
    const principal = getPrincipal(res);
    const tenant = tenantData(principal.tenantId)!;
    const now = Date.now();
    return res.json({
      users: deps.getState().users.filter((user) => user.tenantId === principal.tenantId).map((user) => ({
        id: user.id, name: user.name, email: user.email, active: !user.disabled,
        lockedUntil: user.lockedUntil && user.lockedUntil > now ? user.lockedUntil : null,
        canManageSecurity: effectivePermissions(user, tenant).includes('security:manage')
      }))
    });
  });
const accountLockSchema = z.object({ durationMinutes: z.number().int().min(1).max(1440).default(60) }).strict();
app.post('/api/auth/users/:userId/lock', accessAuthentication, requirePermission('security:manage'),
  (req: Request, res: Response) => {
    const principal = getPrincipal(res);
    const targetId = String(req.params.userId);
    if (targetId === principal.userId) return res.status(409).json({ error: 'Cannot lock your own administrative account' });
    const parsed = accountLockSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid lock duration' });
    const target = deps.getState().users.find((item) => item.id === targetId && item.tenantId === principal.tenantId);
    const tenant = tenantData(principal.tenantId)!;
    if (!target) return res.status(404).json({ error: 'Tenant user not found' });
    const lastAdmin = effectivePermissions(target, tenant).includes('security:manage')
      && !deps.getState().users.some((user) => user.tenantId === principal.tenantId && user.id !== targetId
        && !user.disabled && (!user.lockedUntil || user.lockedUntil <= Date.now())
        && effectivePermissions(user, tenant).includes('security:manage'));
    if (lastAdmin) return res.status(409).json({ error: 'Cannot lock the last active tenant security administrator' });
    const until = Date.now() + parsed.data.durationMinutes * 60_000;
    const nextState: PlatformState = {
      ...deps.getState(),
      users: deps.getState().users.map((user) => user.id === target.id && user.tenantId === target.tenantId
        ? { ...user, lockedUntil: until, authVersion: (user.authVersion ?? 0) + 1 }
        : user),
      refreshSessions: revokeUserRefreshSessions(target.id, target.tenantId),
      tenants: { ...deps.getState().tenants, [principal.tenantId]: withSecurityEvent(
        tenant, principal.userId, 'auth.account.locked', undefined, target.id) }
    };
    persistState(nextState);
    deps.setState(nextState);
    return res.json({ userId: target.id, lockedUntil: until });
  });
app.post('/api/auth/users/:userId/unlock', accessAuthentication, requirePermission('security:manage'),
  (req: Request, res: Response) => {
    const principal = getPrincipal(res);
    const userId = String(req.params.userId);
    const target = deps.getState().users.find((item) => item.id === userId && item.tenantId === principal.tenantId);
    if (!target) return res.status(404).json({ error: 'Tenant user not found' });
    const updated: LocalUser = { ...target, authVersion: (target.authVersion ?? 0) + 1 };
    delete updated.lockedUntil;
    const nextState: PlatformState = {
      ...deps.getState(),
      users: deps.getState().users.map((item) => item.id === target.id && item.tenantId === target.tenantId ? updated : item),
      refreshSessions: revokeUserRefreshSessions(target.id, target.tenantId),
      tenants: { ...deps.getState().tenants, [principal.tenantId]: withSecurityEvent(
        tenantData(principal.tenantId)!, principal.userId, 'auth.account.unlocked', undefined, target.id) }
    };
    persistState(nextState);
    deps.setState(nextState);
    userLoginFailures.delete(target.id);
    return res.json({ userId: target.id, unlocked: true });
  });

app.get('/api/auth/security-events', accessAuthentication, requirePermission('security:manage'), (req: Request, res: Response) => {
  const tenant = tenantData(getPrincipal(res).tenantId)!;
  const max = Number(req.query.limit ?? 100);
  if (!Number.isInteger(max) || max < 1 || max > 500)
    return res.status(400).json({ error: 'limit must be between 1 and 500' });
  return res.json({ events: tenant.securityAudit.slice(-max).reverse() });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().min(12).max(256)
});
const passwordChangeAttempts = new Map<string, { count: number; resetAt: number }>();
app.post('/api/auth/change-password', accessAuthentication, async (req: Request, res: Response) => {
  if (jwtService.config.mode !== 'local') return res.status(501).json({ error: 'Password changes are managed by the identity provider' });
  const principal = getPrincipal(res);
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid password request; new password must have at least 12 characters' });
  if (parsed.data.currentPassword === parsed.data.newPassword) return res.status(400).json({ error: 'Choose a different new password' });
  const key = principal.userId;
  const now = Date.now();
  const attempts = passwordChangeAttempts.get(key);
  if (attempts && attempts.resetAt > now && attempts.count >= 5) return res.status(429).json({ error: 'Too many attempts; try again later' });
  const user = principalUser(principal);
  if (!user) return res.status(401).json({ error: 'User not available' });
  const verified = await verifyPassword(parsed.data.currentPassword, user.passwordSalt, user.passwordHash);
  if (!verified) {
    passwordChangeAttempts.set(key, { count: attempts && attempts.resetAt > now ? attempts.count + 1 : 1, resetAt: now + 15 * 60 * 1000 });
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  passwordChangeAttempts.delete(key);
  const hashed = await hashPassword(parsed.data.newPassword);
  const changedAt = Math.floor(Date.now() / 1000);
  const nextState: PlatformState = {
    ...deps.getState(),
    users: deps.getState().users.map((item) => item.id === user.id && item.tenantId === user.tenantId
      ? (() => {
        const updated: LocalUser = { ...item, passwordSalt: hashed.salt, passwordHash: hashed.hash,
          authVersion: (item.authVersion ?? 0) + 1 };
        delete updated.passwordReset;
        return updated;
      })()
      : item),
    refreshSessions: deps.getState().refreshSessions.map((session) => session.userId === user.id && session.tenantId === user.tenantId
      ? { ...session, revokedAt: changedAt } : session),
    tenants: {
      ...deps.getState().tenants,
      [user.tenantId]: withSecurityEvent(tenantData(user.tenantId)!, user.id, 'auth.password.changed')
    }
  };
  try { persistState(nextState); deps.setState(nextState); }
  catch { return res.status(503).json({ error: 'Could not save new password. Please retry.' }); }
  clearRefreshCookie(res);
  return res.status(200).json({ changed: true, signedOut: true });
});

}
