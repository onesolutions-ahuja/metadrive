/**
 * Resolve a tenant from the explicitly configured public hostname. No DNS,
 * database query, proxy-trusted header, wildcard suffix or user-supplied
 * tenant identifier is needed on the request path.
 *
 * METADRIVE_TENANT_HOSTS={"shop.example.com":"shop-tenant",...}
 * METADRIVE_SHARED_API_HOSTS=api.example.com,localhost,127.0.0.1
 *
 * The Host header identifies same-origin tenant requests. A known tenant
 * Origin identifies cross-origin web requests to a shared API host. Origin
 * is not an authentication credential: a signed tenant JWT is still required
 * for every protected API route.
 */
export type TenantHostConfig = {
  enabled: boolean;
  tenantsByHost: ReadonlyMap<string, string>;
  sharedHosts: ReadonlySet<string>;
};

function hostname(value: string): string | null {
  if (!value || /[\s/@?#\\]/.test(value)) return null;
  const text = value.trim().toLowerCase();
  if (!/^(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::[0-9]{1,5})?$/.test(text)) return null;
  try {
    const url = new URL('http://' + text);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    const result = url.hostname.replace(/\.$/, '').replace(/^\[|\]$/g, '');
    if (!result || result.includes('..')) return null;
    return result;
  } catch {
    return null;
  }
}

function originHostname(origin: string): string | null {
  try {
    const url = new URL(origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash || url.origin !== origin) return null;
    const host = hostname(url.host);
    if (!host || (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(host))) return null;
    return host;
  } catch {
    return null;
  }
}

export function tenantHostConfig(
  mappingJson: string | undefined,
  sharedCsv: string | undefined
): TenantHostConfig {
  const raw = mappingJson?.trim();
  const mapped = new Map<string, string>();
  const shared = new Set<string>(['localhost', '127.0.0.1', '::1']);
  for (const part of (sharedCsv ?? '').split(',')) {
    if (!part.trim()) continue;
    const host = hostname(part.trim());
    if (!host) throw Error('METADRIVE_SHARED_API_HOSTS contains an invalid hostname');
    shared.add(host);
  }
  if (!raw) return { enabled: false, tenantsByHost: mapped, sharedHosts: shared };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw Error('METADRIVE_TENANT_HOSTS must be a JSON object of hostname to tenant ID'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Error('METADRIVE_TENANT_HOSTS must be a JSON object');
  }
  for (const [rawHost, rawTenant] of Object.entries(parsed)) {
    const host = hostname(rawHost);
    if (!host || typeof rawTenant !== 'string' || !rawTenant.trim() || shared.has(host) || mapped.has(host)) {
      throw Error('METADRIVE_TENANT_HOSTS contains an invalid, shared or duplicate hostname mapping');
    }
    mapped.set(host, rawTenant);
  }
  if (!mapped.size) throw Error('METADRIVE_TENANT_HOSTS must contain at least one tenant mapping');
  return { enabled: true, tenantsByHost: mapped, sharedHosts: shared };
}

export function tenantForRequest(
  config: TenantHostConfig,
  requestHost: string | undefined,
  requestOrigin: string | undefined
): { allowed: boolean; tenantId: string | null } {
  if (!config.enabled) return { allowed: true, tenantId: null };
  const host = hostname(requestHost ?? '');
  if (!host) return { allowed: false, tenantId: null };
  const directTenant = config.tenantsByHost.get(host);
  if (!directTenant && !config.sharedHosts.has(host)) return { allowed: false, tenantId: null };
  const originHost = requestOrigin ? originHostname(requestOrigin) : null;
  if (requestOrigin && !originHost) return { allowed: false, tenantId: null };
  const originTenant = originHost ? config.tenantsByHost.get(originHost) : undefined;
  // A browser Origin on a shared API host must be either the API's own host
  // or an explicitly mapped tenant; never silently accept unknown origins.
  if (requestOrigin && originHost !== host && !originTenant)
    return { allowed: false, tenantId: null };
  // A mapped tenant host may receive only same-tenant browser origins.
  if (directTenant && requestOrigin && originHost !== host && originTenant !== directTenant)
    return { allowed: false, tenantId: null };
  if (directTenant && originTenant && directTenant !== originTenant)
    return { allowed: false, tenantId: null };
  if (directTenant) return { allowed: true, tenantId: directTenant };
  if (originTenant) return { allowed: true, tenantId: originTenant };
  // Shared API hosts also support explicit central sign-in/API clients. Those
  // requests remain isolated by their signed JWT's tenant_id claim.
  return { allowed: true, tenantId: null };
}

export function mappedTenantOrigin(config: TenantHostConfig, origin: string): boolean {
  const host = originHostname(origin);
  return Boolean(host && config.tenantsByHost.has(host) && new URL(origin).protocol === 'https:');
}
