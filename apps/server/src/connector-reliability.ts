/** Generic outbound resilience primitive. No provider-specific behaviour or secrets. */
export type CalloutResponse = { status: number; headers?: Record<string, string | undefined> };
export type CalloutPolicy = { maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number };
export type CalloutAudit = { tenantId: string; credentialId: string; status?: number; attempts: number; outcome: 'success' | 'failed'; errorCode?: string };
export type CalloutOptions<T extends CalloutResponse> = {
  tenantId: string;
  credentialId: string;
  method: string;
  idempotencyKey?: string;
  policy?: CalloutPolicy;
  send: (attempt: number) => Promise<T>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  audit?: (event: CalloutAudit) => void | Promise<void>;
};

export class CalloutFault extends Error {
  constructor(public readonly code: string, public readonly status: number | undefined,
    public readonly attempts: number, public readonly retryable: boolean) {
    super(code);
    this.name = 'CalloutFault';
  }
}

const transientStatus = (status: number) => [408, 425, 429, 500, 502, 503, 504].includes(status);
const bound = (value: number | undefined, fallback: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value!))) : fallback;
const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function retryAfterMs(headers: Record<string, string | undefined> | undefined, now = Date.now()): number | null {
  const value = Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === 'retry-after')?.[1]?.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return Math.min(Number(value) * 1000, 60_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.min(date - now, 60_000)) : null;
}

/** Only safe verbs, or operations with explicit deduplication, may be retried. */
export function mayRetry(method: string, idempotencyKey?: string): boolean {
  const verb = method.toUpperCase();
  return verb === 'GET' || verb === 'HEAD' || (Boolean(idempotencyKey?.trim()) && idempotencyKey!.length <= 200);
}

export async function executeReliableCallout<T extends CalloutResponse>(options: CalloutOptions<T>): Promise<T> {
  if (!options.tenantId || !options.credentialId) throw new CalloutFault('INVALID_SCOPE', undefined, 0, false);
  const attempts = mayRetry(options.method, options.idempotencyKey)
    ? bound(options.policy?.maxAttempts, 1, 1, 5) : 1;
  const base = bound(options.policy?.baseDelayMs, 250, 1, 20_000);
  const maximum = bound(options.policy?.maxDelayMs, 30_000, base, 60_000);
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? Date.now;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response: T | undefined;
    let thrown = false;
    try { response = await options.send(attempt); }
    catch { thrown = true; }
    if (response && response.status >= 200 && response.status < 400) {
      await options.audit?.({ tenantId: options.tenantId, credentialId: options.credentialId,
        status: response.status, attempts: attempt, outcome: 'success' });
      return response;
    }
    const retryable = thrown || Boolean(response && transientStatus(response.status));
    if (!retryable || attempt === attempts) {
      const fault = new CalloutFault(thrown ? 'NETWORK_FAILURE' : response?.status === 401 || response?.status === 403
        ? 'AUTH_FAILURE' : retryable ? 'RETRIES_EXHAUSTED' : 'HTTP_FAILURE', response?.status, attempt, retryable);
      await options.audit?.({ tenantId: options.tenantId, credentialId: options.credentialId,
        status: response?.status, attempts: attempt, outcome: 'failed', errorCode: fault.code });
      throw fault;
    }
    const retryAfter = retryAfterMs(response?.headers, now());
    await sleep(retryAfter ?? Math.min(maximum, base * 2 ** (attempt - 1)));
  }
  throw new CalloutFault('UNREACHABLE', undefined, attempts, false);
}

/** Per-tenant, per-credential circuit breaker; never global across tenants. */
export class CalloutCircuitBreaker {
  private readonly states = new Map<string, { failures: number; openUntil: number }>();
  constructor(private readonly threshold = 5, private readonly cooldownMs = 30_000,
    private readonly now: () => number = Date.now) {}
  private key(tenantId: string, credentialId: string) { return JSON.stringify([tenantId, credentialId]); }
  assertAllowed(tenantId: string, credentialId: string) {
    const state = this.states.get(this.key(tenantId, credentialId));
    if (state && state.openUntil > this.now()) throw new CalloutFault('CIRCUIT_OPEN', undefined, 0, true);
  }
  record(tenantId: string, credentialId: string, success: boolean) {
    const key = this.key(tenantId, credentialId);
    if (success) { this.states.delete(key); return; }
    const previous = this.states.get(key);
    const failures = (previous && previous.openUntil > this.now() ? previous.failures : previous?.openUntil ? 0 : previous?.failures ?? 0) + 1;
    this.states.set(key, { failures, openUntil: failures >= this.threshold ? this.now() + this.cooldownMs : 0 });
  }
}
