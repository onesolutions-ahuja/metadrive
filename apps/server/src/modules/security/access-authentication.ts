import type { Request, Response, NextFunction } from 'express';
import type { PlatformState } from '../../index.js';
import type { JwtService, Principal } from '../../auth.js';
import { bearerToken, tenantForRequestHost } from './request-auth.js';

type User = PlatformState['users'][number];
type Tenant = PlatformState['tenants'][string];
export interface AccessAuthenticationDependencies {
  jwtService: JwtService;
  getState: () => PlatformState;
  tenantIsActive: (tenantId: string) => boolean;
  requestTenantMatches: (req: Request, tenantId: string) => boolean;
  mfaRequiredForUser: (tenant: Tenant, user: User) => boolean;
  effectivePermissions: (user: User, tenant: Tenant) => string[];
}
/** Resolve identity and effective RBAC on every request: never trust stale token grants. */
export function createAccessAuthentication(deps: AccessAuthenticationDependencies) {
  const { jwtService, tenantIsActive, requestTenantMatches, mfaRequiredForUser, effectivePermissions } = deps;
  return function accessAuthentication(req: Request, res: Response, next: NextFunction): void {
  const token = bearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Bearer access token required' });
    return;
  }
  void jwtService.verify(token).then((claims) => {
    const state = deps.getState();
    const tokenId = claims.jti;
    const tenantId = claims.tenant_id;
    const userId = claims.sub;
    const hostTenant = tenantForRequestHost(req, state.tenantRegistry);
    if (hostTenant && (hostTenant.status !== 'VERIFIED' || hostTenant.tenantId !== tenantId)) {
      res.status(401).json({ error: 'This session belongs to a different tenant domain' });
      return;
    }
    if (!tokenId || !tenantId || !userId) {
      res.status(401).json({ error: 'Access token is missing identity claims' });
      return;
    }
    const revokedUntil = state.revokedAccessTokens[tokenId];
    if (revokedUntil && revokedUntil > Date.now() / 1000) {
      res.status(401).json({ error: 'Access token has been revoked' });
      return;
    }
    const user = state.users.find((item) => item.id === userId && item.tenantId === tenantId && !item.disabled);
    if (!user || !state.tenants[tenantId] || !tenantIsActive(tenantId)) {
      res.status(401).json({ error: 'Tenant membership is no longer active' });
      return;
    }
    if (!requestTenantMatches(req, user.tenantId)) {
      res.status(403).json({ error: 'This account cannot access the requested tenant hostname.' });
      return;
    }
    if (user.lockedUntil && user.lockedUntil > Date.now()) {
      res.status(401).json({ error: 'Account temporarily locked' });
      return;
    }
    if ((claims.auth_version ?? 0) !== (user.authVersion ?? 0)) {
      res.status(401).json({ error: 'Authentication state has changed; sign in again' });
      return;
    }
    if ((claims.mfa_version ?? 0) !== (user.mfaVersion ?? 0)) {
      res.status(401).json({ error: 'Authentication state has changed; sign in again' });
      return;
    }
    if (mfaRequiredForUser(state.tenants[tenantId], user) && !claims.amr?.includes('otp')) {
      res.status(401).json({ error: 'MFA verification is required' });
      return;
    }
    if (user.authRevokedBefore !== undefined &&
        (typeof claims.iat !== 'number' || claims.iat <= user.authRevokedBefore)) {
      res.status(401).json({ error: 'Access token was issued before credentials changed' });
      return;
    }
    // Portal identities have a deliberately narrow route allowlist, separate
    // from role and object permissions. They cannot reach Setup, credentials,
    // sharing administration, Flows, reports, or record mutation endpoints.
    const accessMetadataUser = state.tenants[tenantId].accessControl.users
      .find((member) => member.id === user.id);
    if (accessMetadataUser?.userType === 'external') {
      const portalRecordRead = req.method === 'GET' &&
        /^\/api\/records\/[A-Za-z0-9_]+(?:\/[A-Za-z0-9_-]+)?$/.test(req.path);
      if (!(portalRecordRead || (req.method === 'GET' && req.path === '/api/auth/me'))) {
        res.status(403).json({ error: 'External identities cannot use this tenant API' });
        return;
      }
    }
    res.locals.principal = {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      roles: claims.roles,
      permissions: effectivePermissions(user, state.tenants[tenantId])
    } satisfies Principal;
    next();
  }).catch(() => {
    res.status(401).json({ error: 'Access token is invalid or expired' });
  });
  };
}
