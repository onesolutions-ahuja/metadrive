import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/** AES-GCM envelope for durable outbound requests; no unencrypted body enters PostgreSQL. */
export type IntegrationEnvelopeKeys = { activeKeyId: string; keys: Map<string, Buffer> };
const domain = (tenantId: string, operationKey: string) =>
  Buffer.from('metadrive:integration-outbox:v1:' + tenantId + ':' + operationKey, 'utf8');
const keyPattern = /^[A-Za-z0-9_-]{1,64}$/;
export function sealIntegrationEnvelope(tenantId: string, operationKey: string, contents: unknown,
  ring: IntegrationEnvelopeKeys): string {
  const key = ring.keys.get(ring.activeKeyId);
  if (!tenantId || !operationKey || !keyPattern.test(ring.activeKeyId) || !key || key.length !== 32)
    throw new Error('INTEGRATION_ENCRYPTION_UNAVAILABLE');
  const plaintext = Buffer.from(JSON.stringify(contents), 'utf8');
  if (!plaintext.length || plaintext.length > 256 * 1024) throw new Error('INTEGRATION_PAYLOAD_TOO_LARGE');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(domain(tenantId, operationKey));
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const fields = [ring.activeKeyId, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url')];
  return 'enc:' + fields.join('.');
}
export function openIntegrationEnvelope(tenantId: string, operationKey: string, envelope: string,
  ring: IntegrationEnvelopeKeys): unknown {
  if (!tenantId || !operationKey || typeof envelope !== 'string' || envelope.length > 400_000 ||
    !envelope.startsWith('enc:')) throw new Error('INTEGRATION_ENVELOPE_INVALID');
  const segments = envelope.slice(4).split('.');
  if (segments.length !== 4 || !keyPattern.test(segments[0]) ||
    segments.slice(1).some(s => !/^[A-Za-z0-9_-]+$/.test(s))) throw new Error('INTEGRATION_ENVELOPE_INVALID');
  const key = ring.keys.get(segments[0]);
  if (!key || key.length !== 32) throw new Error('INTEGRATION_ENCRYPTION_UNAVAILABLE');
  try {
    const iv = Buffer.from(segments[1], 'base64url');
    const tag = Buffer.from(segments[2], 'base64url');
    const ciphertext = Buffer.from(segments[3], 'base64url');
    if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length || ciphertext.length > 256 * 1024 + 16)
      throw new Error('INVALID');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(domain(tenantId, operationKey));
    decipher.setAuthTag(tag);
    const raw = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (raw.length > 256 * 1024) throw new Error('INVALID');
    return JSON.parse(raw.toString('utf8')) as unknown;
  } catch { throw new Error('INTEGRATION_ENVELOPE_INVALID'); }
}
