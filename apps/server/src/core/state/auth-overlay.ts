import type { DurableAuthLogin, AuthLogoutRevocation } from '../../postgres-state.js';
import type { PlatformState, SecurityAuditEvent } from './types.js';

/** Replay independently committed authentication changes after restart and refresh. */
export function createDurableAuthOverlay(options: { persistenceMode: string; durableAuthLogins: DurableAuthLogin[]; durableLogouts: AuthLogoutRevocation[] }) {
  const { persistenceMode, durableAuthLogins, durableLogouts } = options;
  let authOverlayRevision = 0;
  function restoreDurableAuthOverlay(snapshot: PlatformState): PlatformState {
    if (persistenceMode !== 'typed') return snapshot;
    const now = Date.now() / 1000;
    const usersById = new Map(snapshot.users.map(user => [user.id, user.tenantId]));
    const existingSessionHashes = new Set(snapshot.refreshSessions.map(session => session.tokenHash));
    const refreshSessions = [...snapshot.refreshSessions];
    const securityByTenant = new Map<string, SecurityAuditEvent[]>();
    for (const entry of durableAuthLogins) {
      if (!snapshot.tenants[entry.tenantId] || usersById.get(entry.userId) !== entry.tenantId) continue;
      if (entry.expiresAt > now && !existingSessionHashes.has(entry.tokenHash)) {
        refreshSessions.push({
          tokenHash: entry.tokenHash, familyId: entry.familyId,
          userId: entry.userId, tenantId: entry.tenantId, expiresAt: entry.expiresAt,
          usedAt: entry.usedAt, revokedAt: entry.revokedAt,
          mfaVerified: entry.mfaVerified, authVersion: entry.authVersion
        });
        existingSessionHashes.add(entry.tokenHash);
      }
      if (!securityByTenant.has(entry.tenantId)) securityByTenant.set(entry.tenantId, []);
      securityByTenant.get(entry.tenantId)!.push({
        id: entry.auditId, at: entry.auditAt,
        actorUserId: entry.userId, action: 'auth.login.succeeded'
      });
    }
    const tenants = { ...snapshot.tenants };
    for (const [tenantId, events] of securityByTenant) {
      const tenant = tenants[tenantId];
      const audit = new Map(tenant.securityAudit.map(event => [event.id, event]));
      for (const event of events) if (!audit.has(event.id)) audit.set(event.id, event);
      tenants[tenantId] = {
        ...tenant,
        securityAudit: [...audit.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-5000)
      };
    }
    const revokedAccessTokens = { ...snapshot.revokedAccessTokens };
    const refreshRevocations = new Map<string, number>();
    for (const entry of durableLogouts) {
      if (entry.accessExpiresAt > now)
        revokedAccessTokens[entry.jti] = Math.max(revokedAccessTokens[entry.jti] ?? 0, entry.accessExpiresAt);
      if (entry.refreshHash && entry.refreshExpiresAt !== null && entry.refreshExpiresAt > now) {
        const key = entry.tenantId + ':' + entry.userId + ':' + entry.refreshHash;
        refreshRevocations.set(key, Math.max(refreshRevocations.get(key) ?? 0, entry.revokedAt));
      }
    }
    return {
      ...snapshot, tenants, revokedAccessTokens,
      refreshSessions: refreshSessions.map(session => {
        const revokedAt = refreshRevocations.get(session.tenantId + ':' + session.userId + ':' + session.tokenHash);
        return revokedAt === undefined ? session
          : { ...session, revokedAt: Math.max(session.revokedAt ?? 0, revokedAt) };
      })
    };
  }
  return { durableAuthLogins, durableLogouts, restoreDurableAuthOverlay,
    get authOverlayRevision() { return authOverlayRevision; },
    set authOverlayRevision(value: number) { authOverlayRevision = value; } };
}
