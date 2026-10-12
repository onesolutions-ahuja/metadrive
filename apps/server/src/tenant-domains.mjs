// MD-03.5: deterministic tenant-domain boundaries; no DNS or database access here.
// Registrable hosts only. Do not treat developer-email domains as claimed domains.
const label = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
export function normalizeTenantDomain(value) {
  if (typeof value !== 'string' || !value || value !== value.trim())
    throw new Error('Domain must be a hostname without spaces');
  const host = value.toLowerCase().replace(/\.$/, '');
  const parts = host.split('.');
  if (host.length > 253 || parts.length < 2 || parts.some((part) => !label.test(part))
    || parts.at(-1).length < 2 || /^\d+$/.test(parts.at(-1))
    || ['localhost', 'local', 'internal', 'invalid'].includes(parts.at(-1)))
    throw new Error('Enter a valid public DNS hostname without protocol, port, wildcard or path');
  return host;
}
export function domainChallenge(hostname, token) {
  return { type: 'TXT', host: '_metadrive-verification.' + hostname,
    value: 'metadrive-verification=' + token };
}
export function matchesDomainChallenge(records, value) {
  // DNS TXT character strings inside the SAME record are joined; different
  // records must never be joined to fabricate a successful proof.
  return Array.isArray(records) && records.some((chunks) =>
    Array.isArray(chunks) && chunks.every((part) => typeof part === 'string')
      && chunks.join('') === value);
}
export function reservedDomain(hostname, webOrigins) {
  for (const origin of webOrigins) {
    try {
      const existing = new URL(origin).hostname.toLowerCase();
      if (hostname === existing || hostname.endsWith('.' + existing)) return true;
    } catch { /* ignore invalid configuration entries */ }
  }
  return false;
}
export function verifiedHostTenant(registry, host) {
  if (typeof host !== 'string') return undefined;
  const clean = host.toLowerCase();
  for (const [tenantId, tenant] of Object.entries(registry)) {
    if (tenant?.domains?.some((item) => item.hostname === clean && item.status === 'VERIFIED'))
      return tenantId;
  }
  return undefined;
}
