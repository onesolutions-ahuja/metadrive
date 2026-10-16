import { z } from 'zod';
import { isIP } from 'node:net';
import type { FlowRuntimeContext, StoredNamedCredential } from '../../index.js';

/** Reusable outbound HTTPS safety and response mapping for tenant Flows and connectors. */
export function createHttpSafetyRuntime(deps: { resolveFlowValue: (value: unknown, context: FlowRuntimeContext) => unknown }) {
 const { resolveFlowValue } = deps;
function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const octets = address.split('.').map(Number);
    const [first, second] = octets;
    return !(first === 0 || first === 10 || first === 127 || first >= 224
      || (first === 100 && second >= 64 && second <= 127)
      || (first === 169 && second === 254)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 192 && second === 0)
      || (first === 192 && second === 168)
      || (first === 198 && (second === 18 || second === 19 || second === 51))
      || (first === 203 && second === 0)
      || (first === 255 && second === 255));
  }
  if (version === 6) {
    const normalized = address.toLowerCase();
    const firstHextet = Number.parseInt(normalized.split(':')[0] || '0', 16);
    return (firstHextet & 0xe000) === 0x2000
      && !normalized.startsWith('2001:db8:')
      && !normalized.startsWith('2001:0000:')
      && !normalized.startsWith('2001:0:');
  }
  return false;
}

function isReservedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return ['localhost', 'local', 'internal', 'test', 'invalid', 'example'].includes(host)
    || ['.localhost', '.local', '.internal', '.test', '.invalid', '.example', '.example.com', '.example.net', '.example.org'].some((suffix) => host.endsWith(suffix));
}

function resolveCalloutUrl(credential: Pick<StoredNamedCredential, 'baseUrl'>, path: string, context: FlowRuntimeContext): URL {
  if (!path || path.startsWith('/') || path.startsWith('\\') || path.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(path)) {
    throw new Error('HTTP Callout path must be relative to its Named Credential base URL.');
  }
  const expandedPath = path.replace(/\{!?([A-Za-z_$][A-Za-z0-9_$.]*)\}/g, (_match, reference: string) => {
    const value = resolveFlowValue(`{${reference}}`, context);
    if (value === undefined || value === null) throw new Error(`HTTP Callout path references an unavailable flow value "${reference}".`);
    return encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  if (expandedPath.split(/[/?#]/).some((segment) => segment === '..')) throw new Error('HTTP Callout path cannot traverse outside the Named Credential base path.');
  const base = new URL(credential.baseUrl);
  // Named Credential base URLs represent a directory, even when configured without
  // a trailing slash (for example the WhatsApp phone-number endpoint).
  if (!base.pathname.endsWith('/')) base.pathname += '/';
  const target = new URL(expandedPath, base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    throw new Error('HTTP Callout target must remain within its Named Credential base URL.');
  }
  if (target.protocol !== 'https:' || target.username || target.password || target.hash) {
    throw new Error('HTTP Callout target must be a safe HTTPS URL.');
  }
  const host = target.hostname.replace(/^\[|\]$/g, '').toLowerCase().replace(/\.$/, '');
  if (isReservedHostname(host)) {
    throw new Error('HTTP Callout targets on local or reserved hostnames are not allowed.');
  }
  if (isIP(host) && !isPublicAddress(host)) throw new Error('HTTP Callout targets on private or reserved IP addresses are not allowed.');
  return target;
}

function mapHttpCalloutResponse(body: unknown, mappingValue: unknown, elementLabel: string): unknown {
  if (mappingValue === undefined || mappingValue === '') return body;
  let mapping: unknown = mappingValue;
  if (typeof mappingValue === 'string') {
    try {
      mapping = JSON.parse(mappingValue);
    } catch {
      throw new Error(`HTTP Callout "${elementLabel}" response mapping must be valid JSON.`);
    }
  }
  const parsed = z.record(z.string()).safeParse(mapping);
  if (!parsed.success) throw new Error(`HTTP Callout "${elementLabel}" response mapping must be a JSON object of output names to response paths.`);
  return Object.fromEntries(Object.entries(parsed.data).map(([outputName, responsePath]) => {
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(outputName)) throw new Error(`HTTP Callout "${elementLabel}" response mapping contains an invalid output name.`);
    const pathParts = responsePath.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
    const mappedValue = pathParts.reduce<unknown>((value, part) => {
      if (!value || typeof value !== 'object') return undefined;
      return Array.isArray(value) && /^\d+$/.test(part)
        ? value[Number(part)]
        : (value as Record<string, unknown>)[part];
    }, body);
    return [outputName, mappedValue ?? null];
  }));
}


 return { isPublicAddress, isReservedHostname, resolveCalloutUrl, mapHttpCalloutResponse };
}
