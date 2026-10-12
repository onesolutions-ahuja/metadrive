// Data transferred to isolated component frames is allowlisted, bounded and secret-redacted.
// The host always remains authoritative for RBAC and Flow execution.
const forbiddenKey = /(?:^|[_-])(password|secret|credential|authorization|access[_-]?token|refresh[_-]?token|api[_-]?key|private[_-]?key)(?:$|[_-])/i;
const sensitiveKeys = new Set(['token','clientSecret','passwordHash','passwordSalt','bearerToken','apiKey','secretKey','authHeader']);
export const SAFE_COMPONENT_PROP_KEYS = ['label','title','subtitle','value','device','properties','records',
  'products','categories','cartLines','customers','loading','preview','disabled','sessionId','object','flows','actionError'] as const;
export function sandboxSafeValue(input: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (input === null || typeof input === 'boolean') return input;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  if (typeof input === 'string') return input.slice(0,10000);
  if (typeof input !== 'object' || depth > 8 || seen.has(input)) return undefined;
  seen.add(input);
  if (Array.isArray(input)) {
    const result = input.slice(0,500).map((value) => sandboxSafeValue(value,depth+1,seen) ?? null);
    seen.delete(input);
    return result;
  }
  const result: Record<string, unknown> = Object.create(null);
  for (const [key,value] of Object.entries(input).slice(0,250)) {
    if (forbiddenKey.test(key) || sensitiveKeys.has(key) || ['__proto__','prototype','constructor'].includes(key)) continue;
    const clean = sandboxSafeValue(value,depth+1,seen);
    if (clean !== undefined) result[key] = clean;
  }
  seen.delete(input);
  return result;
}
export function sandboxPublicProps(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of SAFE_COMPONENT_PROP_KEYS) {
    if (!(key in props)) continue;
    const clean = sandboxSafeValue(props[key]);
    if (clean !== undefined) result[key] = clean;
  }
  return result;
}
