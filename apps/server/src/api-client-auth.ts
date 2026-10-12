import { createHash, timingSafeEqual } from 'node:crypto';

export type ApiClient = {
  id: string; tenantId: string; userId: string; keySha256: string;
  expiresAt: string; revokedAt?: string | null;
};
export function parseApiClients(raw: string | undefined): ApiClient[] {
  if (!raw) return [];
  const clients: unknown = JSON.parse(raw);
  if (!Array.isArray(clients)) throw new Error('METADRIVE_API_CLIENTS must be an array');
  const ids = new Set<string>();
  return clients.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid API client');
    const client = entry as Record<string, unknown>;
    if (typeof client.id !== 'string' || !client.id || typeof client.tenantId !== 'string' || !client.tenantId
      || typeof client.userId !== 'string' || !client.userId
      || typeof client.keySha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(client.keySha256)
      || typeof client.expiresAt !== 'string' || !Number.isFinite(Date.parse(client.expiresAt))
      || (client.revokedAt != null && (typeof client.revokedAt !== 'string' || !Number.isFinite(Date.parse(client.revokedAt)))))
      throw new Error('Invalid API client configuration');
    if (ids.has(client.id)) throw new Error('Duplicate API client ID');
    ids.add(client.id);
    return client as ApiClient;
  });
}
export function verifiedApiClient(clients: readonly ApiClient[], id: string | undefined,
  secret: string | undefined, tenantId: string, userId: string, now = Date.now()): string | null {
  if (!id || !secret || secret.length < 32 || secret.length > 256) return null;
  const client = clients.find((entry) => entry.id === id && entry.tenantId === tenantId && entry.userId === userId);
  if (!client || Date.parse(client.expiresAt) <= now || (client.revokedAt && Date.parse(client.revokedAt) <= now)) return null;
  const supplied = createHash('sha256').update(secret).digest();
  const expected = Buffer.from(client.keySha256, 'hex');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied) ? client.id : null;
}
