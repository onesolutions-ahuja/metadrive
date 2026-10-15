/** A single tenant-scoped projection for the user-facing session list.
 * Never expose refresh tokens, hashes, or sessions belonging to other tenants.
 */
export type SessionSummarySource = {
  userId: string;
  tenantId: string;
  familyId: string;
  expiresAt: number;
  revokedAt?: number | null;
  usedAt?: number | null;
  mfaVerified?: boolean;
};
export function activeSessionSummaries(
  sessions: readonly SessionSummarySource[], userId: string, tenantId: string, nowSeconds: number
): Array<{ familyId: string; expiresAt: number; mfaVerified: boolean }> {
  return sessions
    .filter((session) => session.userId === userId && session.tenantId === tenantId
      && session.revokedAt == null && session.usedAt == null && session.expiresAt > nowSeconds)
    .map(({ familyId, expiresAt, mfaVerified }) => ({
      familyId, expiresAt, mfaVerified: mfaVerified === true
    }));
}
