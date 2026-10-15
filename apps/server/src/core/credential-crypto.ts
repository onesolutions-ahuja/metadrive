import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { NamedCredentialPayload, StoredNamedCredential, IntegrationConnection } from '../index.js';

type CredentialKeyRing = { activeKeyId: string; keys: Map<string, Buffer> };

export function credentialKeyRing(): CredentialKeyRing {
  const serializedKeys = process.env.METADRIVE_CREDENTIAL_KEYS;
  const activeKeyId = process.env.METADRIVE_CREDENTIAL_ACTIVE_KEY_ID;
  if (!serializedKeys || !activeKeyId) {
    throw new Error('Named Credentials require METADRIVE_CREDENTIAL_KEYS and METADRIVE_CREDENTIAL_ACTIVE_KEY_ID');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serializedKeys);
  } catch {
    throw new Error('METADRIVE_CREDENTIAL_KEYS must be a JSON object of key IDs and base64-encoded 32-byte keys');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('METADRIVE_CREDENTIAL_KEYS must be a JSON object of key IDs and base64-encoded 32-byte keys');
  }
  const keys = new Map<string, Buffer>();
  for (const [keyId, encodedKey] of Object.entries(parsed)) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(keyId) || typeof encodedKey !== 'string') {
      throw new Error('Credential encryption key IDs and values are invalid');
    }
    const key = Buffer.from(encodedKey, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encodedKey) {
      throw new Error(`Credential encryption key "${keyId}" must be a canonical base64-encoded 32-byte key`);
    }
    keys.set(keyId, key);
  }
  if (!keys.has(activeKeyId)) throw new Error('METADRIVE_CREDENTIAL_ACTIVE_KEY_ID must identify a configured encryption key');
  return { activeKeyId, keys };
}
export function credentialAad(tenantId: string, credentialId: string): Buffer {
  return Buffer.from(`metadrive:named-credential:v1:${tenantId}:${credentialId}`, 'utf8');
}
export function sealCredentialPayload(tenantId: string, credentialId: string, payload: NamedCredentialPayload, ring = credentialKeyRing()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ring.keys.get(ring.activeKeyId)!, iv);
  cipher.setAAD(credentialAad(tenantId, credentialId));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    keyId: ring.activeKeyId,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}
export function openCredentialPayload(tenantId: string, credential: StoredNamedCredential, ring = credentialKeyRing()): NamedCredentialPayload {
  const key = ring.keys.get(credential.keyId);
  if (!key) throw new Error(`Credential encryption key "${credential.keyId}" is unavailable; configure it before using or rotating Named Credentials.`);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(credential.iv, 'base64'));
    decipher.setAAD(credentialAad(tenantId, credential.id));
    decipher.setAuthTag(Buffer.from(credential.authTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(credential.ciphertext, 'base64')),
      decipher.final()
    ]).toString('utf8');
    const payload: unknown = JSON.parse(plaintext);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Invalid credential payload');
    return payload as NamedCredentialPayload;
  } catch {
    throw new Error(`Named Credential "${credential.name}" could not be decrypted; verify the encryption key configuration.`);
  }
}
export function sealIntegrationCredentials(tenantId: string, connectionId: string, credentials: Record<string, string>, ring = credentialKeyRing()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', ring.keys.get(ring.activeKeyId)!, iv);
  cipher.setAAD(Buffer.from(`metadrive:integration-connection:v1:${tenantId}:${connectionId}`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()]);
  return {
    credentialKeyId: ring.activeKeyId,
    credentialIv: iv.toString('base64'),
    credentialAuthTag: cipher.getAuthTag().toString('base64'),
    credentialsCiphertext: ciphertext.toString('base64')
  };
}
export function openIntegrationCredentials(tenantId: string, connection: IntegrationConnection, ring = credentialKeyRing()): Record<string, string> {
  if (!connection.credentialKeyId || !connection.credentialIv || !connection.credentialAuthTag || !connection.credentialsCiphertext) return {};
  const key = ring.keys.get(connection.credentialKeyId);
  if (!key) throw new Error(`Credential encryption key "${connection.credentialKeyId}" is unavailable; configure it before using this Integration Connection.`);
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(connection.credentialIv, 'base64'));
    decipher.setAAD(Buffer.from(`metadrive:integration-connection:v1:${tenantId}:${connection.id}`, 'utf8'));
    decipher.setAuthTag(Buffer.from(connection.credentialAuthTag, 'base64'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(connection.credentialsCiphertext, 'base64')),
      decipher.final()
    ]).toString('utf8');
    const payload: unknown = JSON.parse(plaintext);
    const parsed = z.record(z.string()).safeParse(payload);
    if (!parsed.success) throw new Error('Invalid integration credential payload');
    return parsed.data;
  } catch {
    throw new Error(`Integration Connection "${connection.name}" could not be decrypted; verify the encryption key configuration.`);
  }
}
