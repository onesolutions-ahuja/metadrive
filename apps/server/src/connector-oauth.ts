import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

/** Provider-independent OAuth2 logic. Stores and transports are injected by the tenant backend. */
export type OAuthScope = { tenantId: string; credentialId: string };
export type OAuthToken = { accessToken: string; refreshToken?: string; tokenType: 'Bearer'; expiresAtMs: number };
export type OAuthVault = { load(scope: OAuthScope): Promise<OAuthToken | null>; save(scope: OAuthScope, token: OAuthToken): Promise<void> };
export type OAuthSettings = { tokenUrl: string; clientId: string; clientSecret?: string; scope?: string };
export type OAuthTokenRequest = (url: URL, params: URLSearchParams) => Promise<{ status: number; body: unknown }>;
export type OAuthChallenge = { scope: OAuthScope; verifier: string; expiresAtMs: number; redirectUri: string };
export type OAuthChallengeStore = {
  create(stateDigest: string, challenge: OAuthChallenge): Promise<void>;
  /** Atomically remove and return the challenge (single-use, including across API replicas). */
  consume(stateDigest: string): Promise<OAuthChallenge | null>;
};
export class OAuthFault extends Error {
  constructor(public readonly code: string) { super(code); this.name = 'OAuthFault'; }
}
const locks = new Map<string, Promise<OAuthToken>>();
const scopeKey = (scope: OAuthScope) => JSON.stringify([scope.tenantId, scope.credentialId]);
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const random = () => randomBytes(32).toString('base64url');

export function validatedOAuthUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new OAuthFault('INVALID_OAUTH_URL'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash ||
    !url.hostname || isIP(url.hostname) || url.hostname === 'localhost' || url.hostname.endsWith('.localhost'))
    throw new OAuthFault('INVALID_OAUTH_URL');
  return url;
}

function normalizeToken(body: unknown, previous?: OAuthToken): OAuthToken {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new OAuthFault('INVALID_TOKEN_RESPONSE');
  const data = body as Record<string, unknown>;
  if (typeof data.access_token !== 'string' || !data.access_token || data.access_token.length > 16384 ||
    (data.token_type != null && String(data.token_type).toLowerCase() !== 'bearer'))
    throw new OAuthFault('INVALID_TOKEN_RESPONSE');
  const ttl = Number(data.expires_in);
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 365 * 86400) throw new OAuthFault('INVALID_TOKEN_EXPIRY');
  const refreshToken = typeof data.refresh_token === 'string' && data.refresh_token.length <= 16384
    ? data.refresh_token : previous?.refreshToken;
  return { accessToken: data.access_token, ...(refreshToken ? { refreshToken } : {}),
    tokenType: 'Bearer', expiresAtMs: Date.now() + Math.floor(ttl * 1000) };
}

async function tokenRequest(url: string, params: URLSearchParams, request: OAuthTokenRequest, previous?: OAuthToken) {
  const result = await request(validatedOAuthUrl(url), params);
  if (result.status < 200 || result.status >= 300) throw new OAuthFault('TOKEN_EXCHANGE_FAILED');
  return normalizeToken(result.body, previous);
}

export async function beginOAuthAuthorization(settings: OAuthSettings & { authorizationUrl: string; redirectUri: string },
  scope: OAuthScope, store: OAuthChallengeStore, now = Date.now()): Promise<string> {
  if (!scope.tenantId || !scope.credentialId || !settings.clientId) throw new OAuthFault('INVALID_CONFIGURATION');
  const url = validatedOAuthUrl(settings.authorizationUrl);
  validatedOAuthUrl(settings.redirectUri);
  const state = random();
  const verifier = random();
  await store.create(digest(state), { scope, verifier, redirectUri: settings.redirectUri, expiresAtMs: now + 600_000 });
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', settings.clientId);
  url.searchParams.set('redirect_uri', settings.redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('code_challenge', createHash('sha256').update(verifier).digest('base64url'));
  if (settings.scope) url.searchParams.set('scope', settings.scope);
  return url.toString();
}

export async function completeOAuthAuthorization(settings: OAuthSettings, scope: OAuthScope, input: { state: string; code: string },
  challenges: OAuthChallengeStore, vault: OAuthVault, request: OAuthTokenRequest, now = Date.now()): Promise<void> {
  if (!input.state || !input.code || input.state.length > 1024 || input.code.length > 8192) throw new OAuthFault('INVALID_CALLBACK');
  const stateDigest = digest(input.state);
  const challenge = await challenges.consume(stateDigest);
  if (!challenge || challenge.expiresAtMs <= now || !timingSafeEqual(Buffer.from(stateDigest), Buffer.from(digest(input.state))) ||
    scopeKey(challenge.scope) !== scopeKey(scope)) throw new OAuthFault('INVALID_OAUTH_STATE');
  const params = new URLSearchParams({ grant_type: 'authorization_code', code: input.code, client_id: settings.clientId,
    code_verifier: challenge.verifier, redirect_uri: challenge.redirectUri });
  if (settings.clientSecret) params.set('client_secret', settings.clientSecret);
  const token = await tokenRequest(settings.tokenUrl, params, request);
  await vault.save(scope, token);
}

/** Single-flight refresh per tenant + credential. No token state or secrets in logs. */
export async function getOAuthAccessToken(scope: OAuthScope, settings: OAuthSettings & { grantType?: 'authorization_code' | 'client_credentials' },
  vault: OAuthVault, request: OAuthTokenRequest, now = Date.now()): Promise<string> {
  if (!scope.tenantId || !scope.credentialId || !settings.clientId) throw new OAuthFault('INVALID_CONFIGURATION');
  const existing = await vault.load(scope);
  if (existing?.expiresAtMs && existing.expiresAtMs - now > 60_000) return existing.accessToken;
  const key = scopeKey(scope);
  let operation = locks.get(key);
  if (!operation) {
    operation = (async () => {
      const current = await vault.load(scope);
      if (current?.expiresAtMs && current.expiresAtMs - Date.now() > 60_000) return current;
      let params: URLSearchParams;
      if (current?.refreshToken) {
        params = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: current.refreshToken,
          client_id: settings.clientId });
      } else if (settings.grantType === 'client_credentials') {
        params = new URLSearchParams({ grant_type: 'client_credentials', client_id: settings.clientId });
        if (settings.scope) params.set('scope', settings.scope);
      } else throw new OAuthFault('REAUTHORIZATION_REQUIRED');
      if (settings.clientSecret) params.set('client_secret', settings.clientSecret);
      const refreshed = await tokenRequest(settings.tokenUrl, params, request, current ?? undefined);
      await vault.save(scope, refreshed);
      return refreshed;
    })();
    locks.set(key, operation);
    void operation.finally(() => { if (locks.get(key) === operation) locks.delete(key); }).catch(() => {});
  }
  return (await operation).accessToken;
}
