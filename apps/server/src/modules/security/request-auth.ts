import type { Request } from 'express';

/** Extract a single RFC 6750-style bearer credential without accepting extra tokens. */
export function bearerToken(req: Request): string | undefined {
  const authorization = req.header('authorization');
  if (!authorization) return undefined;
  const [scheme, token, ...extra] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token && extra.length === 0 ? token : undefined;
}

export type TenantHostBinding = { tenantId: string; status: 'PENDING' | 'VERIFIED' | 'REVOKED' };
type DomainRegistry = Record<string, { domains?: Array<{ hostname: string; status: TenantHostBinding['status'] }> }>;
/** Cache is scoped to the immutable registry snapshot; never performs a network lookup. */
const hostCache = new WeakMap<DomainRegistry, Map<string, TenantHostBinding>>();
export function tenantForRequestHost(req: Request, registry: DomainRegistry): TenantHostBinding | undefined {
  const hostname = req.hostname?.toLowerCase();
  if (!hostname) return undefined;
  let map = hostCache.get(registry);
  if (!map) {
    map = new Map();
    for (const [tenantId, entry] of Object.entries(registry))
      for (const domain of entry.domains ?? [])
        if (domain.status !== 'REVOKED' || !map.has(domain.hostname))
          map.set(domain.hostname, { tenantId, status: domain.status });
    hostCache.set(registry, map);
  }
  return map.get(hostname);
}
