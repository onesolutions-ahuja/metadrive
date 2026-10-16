/**
 * Add missing versioned Core Standard Object metadata to a legacy tenant.
 * Existing tenant definitions, fields, ordering and administrator edits remain
 * authoritative. Shared Core dependencies are passed from the caller; optional
 * app-specific objects must be seeded through their AppExchange lifecycle.
 */
export function mergeMissingSeededCoreObjects<T extends { apiName: string; kind: string }>(
  existing: readonly T[],
  canonical: readonly T[],
  withDefaults: (object: T) => T,
  sharedDependencies: ReadonlySet<string> = new Set()
): T[] {
  const seen = new Set(existing.map(object => object.apiName));
  let merged: T[] = existing as T[];
  for (const object of canonical) {
    if (object.kind !== 'Standard Object' && !sharedDependencies.has(object.apiName)) continue;
    if (seen.has(object.apiName)) continue;
    if (merged === existing) merged = [...existing];
    merged.push(withDefaults(object));
    seen.add(object.apiName);
  }
  return merged;
}
