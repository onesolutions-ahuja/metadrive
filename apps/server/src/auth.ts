import { createHash, generateKeyPairSync, randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import {
  createRemoteJWKSet,
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWTPayload,
  type KeyLike
} from 'jose';

const scryptAsync = promisify(scrypt);

export type PrincipalClaims = JWTPayload & {
  sub: string;
  tenant_id: string;
  email: string;
  roles: string[];
  permissions: string[];
};

export type Principal = {
  userId: string;
  tenantId: string;
  email: string;
  roles: string[];
  permissions: string[];
};

type JwtConfig = {
  mode: 'local' | 'external';
  issuer: string;
  audience: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  externalJwksUri?: string;
};

export function getJwtConfig(env: NodeJS.ProcessEnv = process.env): JwtConfig {
  const mode = env.AUTH_MODE === 'external' ? 'external' : 'local';
  const issuer = (env.AUTH_ISSUER ?? 'http://localhost:3001/').replace(/\/?$/, '/');
  const audience = env.AUTH_AUDIENCE ?? 'metadrive-api';
  const accessTokenTtlSeconds = Number(env.AUTH_ACCESS_TOKEN_TTL_SECONDS ?? 60 * 60 * 8);
  const refreshTokenTtlSeconds = Number(env.AUTH_REFRESH_TOKEN_TTL_SECONDS ?? 60 * 60 * 24 * 14);
  if (!Number.isInteger(accessTokenTtlSeconds) || accessTokenTtlSeconds < 60 || accessTokenTtlSeconds > 60 * 60 * 8) {
    throw new Error('AUTH_ACCESS_TOKEN_TTL_SECONDS must be an integer between 60 and 28800');
  }
  if (!Number.isInteger(refreshTokenTtlSeconds) || refreshTokenTtlSeconds < 3600 || refreshTokenTtlSeconds > 60 * 60 * 24 * 90) {
    throw new Error('AUTH_REFRESH_TOKEN_TTL_SECONDS must be an integer between 3600 and 7776000');
  }
  if (mode === 'external' && !env.AUTH_JWKS_URI) throw new Error('AUTH_JWKS_URI is required when AUTH_MODE=external');
  return {
    mode,
    issuer,
    audience,
    accessTokenTtlSeconds,
    refreshTokenTtlSeconds,
    ...(env.AUTH_JWKS_URI ? { externalJwksUri: env.AUTH_JWKS_URI } : {})
  };
}

function decodeKey(value: string): string {
  if (value.includes('-----BEGIN')) return value.replace(/\\n/g, '\n');
  return Buffer.from(value, 'base64').toString('utf8');
}

function readOptionalKey(envValue: string | undefined, pathValue: string | undefined): string | undefined {
  if (envValue) return decodeKey(envValue);
  if (pathValue) return readFileSync(pathValue, 'utf8');
  return undefined;
}

export class JwtService {
  readonly config: JwtConfig;
  readonly kid: string;
  private readonly signingKey?: KeyLike;
  private readonly verificationKey?: KeyLike;
  private readonly remoteJwks?: ReturnType<typeof createRemoteJWKSet>;
  private readonly publicKey?: KeyLike;

  private constructor(
    config: JwtConfig,
    kid: string,
    verificationKey?: KeyLike,
    signingKey?: KeyLike,
    publicKey?: KeyLike,
    remoteJwks?: ReturnType<typeof createRemoteJWKSet>
  ) {
    this.config = config;
    this.kid = kid;
    this.verificationKey = verificationKey;
    this.signingKey = signingKey;
    this.publicKey = publicKey;
    this.remoteJwks = remoteJwks;
  }

  static async create(env: NodeJS.ProcessEnv = process.env): Promise<JwtService> {
    const config = getJwtConfig(env);
    if (config.mode === 'external') {
      return new JwtService(config, 'external', undefined, undefined, undefined, createRemoteJWKSet(new URL(config.externalJwksUri!)));
    }

    let privatePem = readOptionalKey(env.AUTH_PRIVATE_KEY, env.AUTH_PRIVATE_KEY_PATH);
    let publicPem = readOptionalKey(env.AUTH_PUBLIC_KEY, env.AUTH_PUBLIC_KEY_PATH);
    if (!privatePem && !publicPem && env.NODE_ENV !== 'production') {
      const generated = generateKeyPairSync('rsa', { modulusLength: 2048 });
      privatePem = generated.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      publicPem = generated.publicKey.export({ type: 'spki', format: 'pem' }).toString();
      console.warn('Using an ephemeral development JWT key pair; access tokens become invalid after restart.');
    }
    if (!privatePem || !publicPem) {
      throw new Error('Local JWT issuer requires both AUTH_PRIVATE_KEY and AUTH_PUBLIC_KEY (or their *_PATH variants)');
    }

    const privateKey = await importPKCS8(privatePem, 'RS256');
    const publicKey = await importSPKI(publicPem, 'RS256');
    const kid = createHash('sha256').update(publicPem).digest('base64url').slice(0, 24);
    return new JwtService(config, kid, publicKey, privateKey, publicKey);
  }

  async issue(principal: Principal): Promise<{ accessToken: string; tokenId: string; expiresAt: number }> {
    if (!this.signingKey) throw new Error('Token issuance is disabled when using an external identity provider');
    const now = Math.floor(Date.now() / 1000);
    const tokenId = randomUUID();
    const accessToken = await new SignJWT({
      tenant_id: principal.tenantId,
      email: principal.email,
      roles: principal.roles,
      permissions: principal.permissions
    })
      .setProtectedHeader({ alg: 'RS256', kid: this.kid, typ: 'JWT' })
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setSubject(principal.userId)
      .setIssuedAt(now)
      .setExpirationTime(now + this.config.accessTokenTtlSeconds)
      .setJti(tokenId)
      .sign(this.signingKey);
    return { accessToken, tokenId, expiresAt: now + this.config.accessTokenTtlSeconds };
  }

  async verify(token: string): Promise<PrincipalClaims> {
    const options = {
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithms: ['RS256']
    };
    const result = this.remoteJwks
      ? await jwtVerify(token, this.remoteJwks, options)
      : this.verificationKey
        ? await jwtVerify(token, this.verificationKey, options)
        : (() => { throw new Error('JWT verification key is unavailable'); })();
    const tenantId = result.payload.tenant_id;
    const roles = result.payload.roles;
    const email = result.payload.email;
    const permissions = result.payload.permissions;
    if (typeof result.payload.sub !== 'string'
      || typeof tenantId !== 'string'
      || typeof email !== 'string'
      || !email.includes('@')
      || !Array.isArray(roles)
      || !roles.every((role) => typeof role === 'string')
      || !Array.isArray(permissions)
      || !permissions.every((permission) => typeof permission === 'string')) {
      throw new Error('JWT is missing required identity, tenant, email, role, or permission claims');
    }
    return result.payload as PrincipalClaims;
  }

  async jwks(): Promise<{ keys: Record<string, unknown>[] }> {
    if (!this.publicKey) return { keys: [] };
    const jwk = await exportJWK(this.publicKey);
    return { keys: [{ ...jwk, kid: this.kid, use: 'sig', alg: 'RS256' }] };
  }

  discovery() {
    return {
      issuer: this.config.issuer,
      jwks_uri: new URL('/.well-known/jwks.json', this.config.issuer).toString(),
      token_endpoint: new URL('/api/auth/login', this.config.issuer).toString(),
      grant_types_supported: ['password', 'refresh_token'],
      response_types_supported: ['token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256']
    };
  }
}

export function createRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string, salt = randomBytes(16).toString('hex')): Promise<{ salt: string; hash: string }> {
  if (password.length < 12 || password.length > 256) throw new Error('Password must be between 12 and 256 characters');
  const derived = await scryptAsync(password, salt, 64) as Buffer;
  return { salt, hash: derived.toString('hex') };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const derived = await scryptAsync(password, salt, 64) as Buffer;
  const expected = Buffer.from(expectedHash, 'hex');
  return expected.length === derived.length && timingSafeEqual(derived, expected);
}
