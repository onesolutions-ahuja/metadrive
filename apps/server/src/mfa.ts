import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** RFC 6238 TOTP: SHA-1, 30-second step, six decimal digits. */
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function newTotpSecret(): string {
  const bytes = randomBytes(20);
  let value = 0;
  let bits = 0;
  let result = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}

function decodeSecret(secret: string): Buffer {
  if (!/^[A-Z2-7]{32}$/.test(secret)) throw new Error('Invalid MFA secret');
  let value = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const letter of secret) {
    value = (value << 5) | alphabet.indexOf(letter);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totpCode(secret: string, step: number): string {
  if (!Number.isSafeInteger(step) || step < 0) throw new Error('Invalid MFA time step');
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(step));
  const hash = createHmac('sha1', decodeSecret(secret)).update(message).digest();
  const offset = hash[hash.length - 1] & 15;
  const value = (hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(value).padStart(6, '0');
}

/** Returns the accepted time step, or null for invalid/reused codes. */
export function verifyTotp(
  secret: string,
  code: string,
  lastUsedStep = -1,
  timestampMs = Date.now()
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const nowStep = Math.floor(timestampMs / 30_000);
  for (const offset of [-1, 0, 1]) {
    const step = nowStep + offset;
    if (step <= lastUsedStep || step < 0) continue;
    const candidate = totpCode(secret, step);
    if (timingSafeEqual(Buffer.from(candidate), Buffer.from(code))) return step;
  }
  return null;
}

export function totpUri(secret: string, email: string): string {
  const name = encodeURIComponent('MetaDrive:' + email);
  return 'otpauth://totp/' + name + '?secret=' + secret + '&issuer=MetaDrive&algorithm=SHA1&digits=6&period=30';
}
