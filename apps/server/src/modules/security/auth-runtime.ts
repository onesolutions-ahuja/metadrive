import { z } from 'zod';
import type { Request, Response } from 'express';
import { performance } from 'node:perf_hooks';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { createRefreshToken, hashToken, type JwtService } from '../../auth.js';
import { credentialKeyRing } from '../../core/credential-crypto.js';
import { persistenceMode, persistDurableAuthLogin, type DurableAuthLogin } from '../../postgres-state.js';
import type { TenantData, LocalUser, SecurityAuditEvent, MfaEncryptedSecret, RefreshSession, PlatformState } from '../../core/state/types.js';
import type { createPlatformStateStore } from '../../core/state/store.js';
import type { initializePlatformState } from '../../core/state/initialization.js';

/** Single secure tenant login, refresh, MFA and session state runtime. */
export function createAuthenticationRuntime(deps: {
 platformStore: ReturnType<typeof createPlatformStateStore>;
 platformInitialization: Awaited<ReturnType<typeof initializePlatformState>>;
 jwtService: JwtService;
 refreshCookieName: string;
 isProduction: boolean;
 effectivePermissions: (user: LocalUser, tenant: TenantData) => string[];
 tenantData: (tenantId: string) => TenantData | undefined;
 persistState: (state: PlatformState) => void;
 withSecurityEvent: (tenant: TenantData, actorUserId: string, action: string, details?: Record<string, string>, targetUserId?: string) => TenantData;
}) {
 const { platformStore, platformInitialization, jwtService, refreshCookieName, isProduction,
  effectivePermissions, tenantData, persistState, withSecurityEvent } = deps;
function cookieValue(req: Request, name: string): string | undefined {
  const header = req.header('cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}
function setRefreshCookie(res: Response, token: string): void {
  const age = jwtService.config.refreshTokenTtlSeconds;
  res.setHeader('Set-Cookie', `${refreshCookieName}=${encodeURIComponent(token)}; Path=/api/auth; HttpOnly; SameSite=${isProduction ? 'None' : 'Lax'}; Max-Age=${age}${isProduction ? '; Secure' : ''}`);
}
function clearRefreshCookie(res: Response): void {
  res.setHeader('Set-Cookie', `${refreshCookieName}=; Path=/api/auth; HttpOnly; SameSite=${isProduction ? 'None' : 'Lax'}; Max-Age=0${isProduction ? '; Secure' : ''}`);
}
function issueRefreshSession(user: LocalUser, previousFamilyId?: string, mfaVerified = false): { token: string; session: RefreshSession } {
  const token = createRefreshToken();
  return {
    token,
    session: {
      tokenHash: hashToken(token), familyId: previousFamilyId ?? randomUUID(),
      userId: user.id, tenantId: user.tenantId,
      expiresAt: Date.now() / 1000 + jwtService.config.refreshTokenTtlSeconds,
      usedAt: null, revokedAt: null, mfaVerified, authVersion: user.authVersion ?? 0
    }
  };
}
// Match the existing tenant metadata:read gate and /auth/me field-level RBAC.
// No business records or credentials are included in this optional payload.
function authenticatedLandingBootstrap(user: LocalUser, tenant: TenantData, permissions: string[]) {
  const principal: Principal = {
    userId: user.id, tenantId: user.tenantId, email: user.email,
    roles: [user.role], permissions
  };
  const accessUser = tenant.accessControl.users.find(item => item.id === user.id);
  const profileId = accessUser?.profileId ?? profileIdForRole(user.role, tenant.accessControl.profiles);
  const fieldAccess = Object.fromEntries(tenant.objects.flatMap(object => object.fields.map(field => [
    `${object.apiName}.${field.apiName}`,
    {
      read: hasFieldPermission(principal, tenant, object.apiName, field.apiName, 'read'),
      edit: hasFieldPermission(principal, tenant, object.apiName, field.apiName, 'edit')
    }
  ])));
  const recordTypeAccess = Object.fromEntries(tenant.objects.flatMap(object => (object.recordTypes ?? [])
    .filter(recordType => recordType.active)
    .map(recordType => [`${object.apiName}.${recordType.id}`,
      hasRecordTypeAccessForUser(user.id, tenant, object.apiName, recordType.id)])));
  const canReadMetadata = permissions.includes('metadata:read');
  return {
    objects: canReadMetadata ? tenant.objects : [],
    pages: canReadMetadata ? tenant.pages : [],
    apps: canReadMetadata ? tenant.apps : [],
    user: { profileId, permissions, fieldAccess, recordTypeAccess }
  };
}
async function issueLoginResponse(res: Response, user: LocalUser, data: TenantData, familyId?: string,
  loginTiming?: { startedAt: number; passwordMs: number }, mfaVerified = false, includeLanding = false): Promise<void> {
  // JWT iat is second-granular. When reactivated in the same second as a
  // suspension, wait until a fresh token is strictly newer than the revocation.
  if (user.authRevokedBefore !== undefined && user.authRevokedBefore >= Math.floor(Date.now() / 1000)) {
    await new Promise<void>((resolve) => setTimeout(resolve,
      Math.max(0, (user.authRevokedBefore! + 1) * 1000 - Date.now() + 5)));
  }
  const permissions = effectivePermissions(user, data);
  const tokenStartedAt = performance.now();
  const issued = await jwtService.issue({
    userId: user.id, tenantId: user.tenantId, email: user.email, roles: [user.role], permissions, mfaVerified,
    mfaVersion: user.mfaVersion ?? 0, authVersion: user.authVersion ?? 0
  });
  const tokenMs = performance.now() - tokenStartedAt;
  const refresh = issueRefreshSession(user, familyId, mfaVerified);
  const sessionStateStartedAt = performance.now();
  if (persistenceMode === 'typed') {
    const securityEvent: SecurityAuditEvent = {
      id: randomUUID(), at: new Date().toISOString(),
      actorUserId: user.id, action: 'auth.login.succeeded'
    };
    const durableEntry: DurableAuthLogin = {
      ...refresh.session, mfaVerified, authVersion: user.authVersion ?? 0,
      auditId: securityEvent.id, auditAt: securityEvent.at
    };
    try {
      // A single durable SQL INSERT replaces full graph serialization,
      // projection, delta verification and the congested state-write pool.
      await persistDurableAuthLogin(durableEntry);
    } catch (error) {
      console.error('Secure login session persistence failed', error);
      return void res.status(503).json({ error: 'Unable to establish a durable session' });
    }
    platformInitialization.durableAuthLogins.push(durableEntry);
    platformInitialization.authOverlayRevision++;
    // Merge onto the latest state after awaiting SQL; concurrent metadata
    // changes must not be overwritten by an older captured state object.
    const latestTenant = platformStore.state.tenants[user.tenantId];
    platformStore.state = {
      ...platformStore.state,
      refreshSessions: [...platformStore.state.refreshSessions, refresh.session],
      tenants: {
        ...platformStore.state.tenants,
        [user.tenantId]: {
          ...latestTenant,
          securityAudit: [...latestTenant.securityAudit, securityEvent].slice(-5000)
        }
      }
    };
    // Authentication has already committed to its own SQL session table.
    // No unrelated metadata commit may delay acknowledgment of this token.
    res.locals.authSqlCommitted = true;
  } else {
    const nextState = {
      ...platformStore.state,
      refreshSessions: [...platformStore.state.refreshSessions, refresh.session],
      tenants: {
        ...platformStore.state.tenants, [user.tenantId]: withSecurityEvent(data, user.id, 'auth.login.succeeded')
      },
      revokedAccessTokens: Object.fromEntries(
        Object.entries(platformStore.state.revokedAccessTokens).filter(([, expiry]) => expiry > Date.now() / 1000))
    };
    persistState(nextState);
    platformStore.state = nextState;
  }
  const sessionStateMs = performance.now() - sessionStateStartedAt;
  setRefreshCookie(res, refresh.token);
  if (loginTiming) {
    // Distinguish password verification, signing and synchronous whole-state
    // serialisation/local-file persistence. The async PostgreSQL commit is
    // enqueued here, not awaited, and must not be reported as complete.
    const ms = (value: number) => Math.max(0, value).toFixed(1);
    res.setHeader('Server-Timing',
      `password;dur=${ms(loginTiming.passwordMs)},signing;dur=${ms(tokenMs)},state-write;dur=${ms(sessionStateMs)},login;dur=${ms(performance.now() - loginTiming.startedAt)}`);
  }
  res.json({
    access_token: issued.accessToken,
    token_type: 'Bearer',
    expires_in: jwtService.config.accessTokenTtlSeconds,
    expires_at: issued.expiresAt,
    user: { id: user.id, name: user.name, email: user.email, tenantId: user.tenantId, role: user.role, permissions },
    ...(includeLanding ? { landing: authenticatedLandingBootstrap(user, data, permissions) } : {})
  });
}

type MfaLoginChallenge = {
  userId: string; tenantId: string; expiresAt: number; attempts: number; pendingSecret?: string; authVersion: number;
};
type MfaEnrollment = { userId: string; tenantId: string; expiresAt: number; attempts: number; secret: string; authVersion: number };
const mfaLoginChallenges = new Map<string, MfaLoginChallenge>();
const mfaEnrollments = new Map<string, MfaEnrollment>();
const mfaFailures = new Map<string, { count: number; resetAt: number }>();
const mfaChallengeTtlMs = 5 * 60 * 1000;
function mfaRequiredForUser(tenant: TenantData, user: LocalUser): boolean {
  return tenant.mfaPolicy.mode === 'Required'
    || (tenant.mfaPolicy.mode === 'Optional' && Boolean(user.mfaSecret));
}
function sealMfaSecret(tenantId: string, userId: string, secret: string): MfaEncryptedSecret {
  const ring = credentialKeyRing();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ring.keys.get(ring.activeKeyId)!, iv);
  cipher.setAAD(Buffer.from('metadrive:mfa:v1:' + tenantId + ':' + userId));
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return {
    keyId: ring.activeKeyId,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}
function openMfaSecret(tenantId: string, userId: string, envelope: MfaEncryptedSecret): string {
  const key = credentialKeyRing().keys.get(envelope.keyId);
  if (!key) throw new Error('MFA encryption key is unavailable');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAAD(Buffer.from('metadrive:mfa:v1:' + tenantId + ':' + userId));
  decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}
function mfaCredentialReady(): boolean {
  try { credentialKeyRing(); return true; } catch { return false; }
}
function newMfaToken<T extends { expiresAt: number }>(store: Map<string, T>, value: T): string {
  const now = Date.now();
  for (const [key, item] of store) if (item.expiresAt <= now) store.delete(key);
  // Bound pending challenges even if a credentialed client repeatedly requests new ones.
  if (store.size >= 2048) store.delete(store.keys().next().value!);
  const raw = randomBytes(32).toString('base64url');
  store.set(hashToken(raw), value);
  return raw;
}
function mfaRateLimited(userId: string): boolean {
  const failure = mfaFailures.get(userId);
  return Boolean(failure && failure.resetAt > Date.now() && failure.count >= 8);
}
function recordMfaFailure(userId: string): void {
  const previous = mfaFailures.get(userId);
  const now = Date.now();
  mfaFailures.set(userId, {
    count: previous && previous.resetAt > now ? previous.count + 1 : 1,
    resetAt: now + 15 * 60 * 1000
  });
}
function revokeUserRefreshSessions(userId: string, tenantId: string): RefreshSession[] {
  const now = Date.now() / 1000;
  return platformStore.state.refreshSessions.map((session) =>
    session.userId === userId && session.tenantId === tenantId && session.revokedAt === null
      ? { ...session, revokedAt: now }
      : session);
}
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const userLoginFailures = new Map<string, { count: number; until: number }>();
function recordUserLoginFailure(user: LocalUser): void {
  const now = Date.now();
  const previous = userLoginFailures.get(user.id);
  const count = previous && previous.until > now ? previous.count + 1 : 1;
  userLoginFailures.set(user.id, { count, until: now + 15 * 60_000 });
  if (userLoginFailures.size > 4096) {
    for (const [id, item] of userLoginFailures) if (item.until <= now) userLoginFailures.delete(id);
  }
  if (count < 8 || (user.lockedUntil ?? 0) > now) return;
  const tenant = tenantData(user.tenantId);
  if (!tenant) return;
  const nextState: PlatformState = {
    ...platformStore.state,
    users: platformStore.state.users.map((item) => item.id === user.id && item.tenantId === user.tenantId
      ? { ...item, lockedUntil: now + 15 * 60_000, authVersion: (item.authVersion ?? 0) + 1 }
      : item),
    refreshSessions: revokeUserRefreshSessions(user.id, user.tenantId),
    tenants: { ...platformStore.state.tenants, [user.tenantId]: withSecurityEvent(
      tenant, user.id, 'auth.account.auto-locked') }
  };
  persistState(nextState);
  platformStore.state = nextState;
}
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(256)
});

 return { cookieValue, setRefreshCookie, clearRefreshCookie, issueRefreshSession, authenticatedLandingBootstrap, issueLoginResponse, mfaLoginChallenges, mfaEnrollments, mfaFailures, mfaChallengeTtlMs, mfaRequiredForUser, sealMfaSecret, openMfaSecret, mfaCredentialReady, newMfaToken, mfaRateLimited, recordMfaFailure, revokeUserRefreshSessions, loginAttempts, userLoginFailures, recordUserLoginFailure, loginSchema };
}
