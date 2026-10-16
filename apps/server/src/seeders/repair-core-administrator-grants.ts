/**
 * Idempotent Core metadata grant repair for seeded full-tenant administration
 * policies. Existing entries, including explicit denials, remain untouched.
 * Independently installed Custom Objects are owned by AppExchange seeders.
 */
export function restoreMissingCoreAdministratorGrants<T extends object>(
  objectPermissions: Record<string, T>,
  objects: ReadonlyArray<{ apiName: string; kind: string }>,
  fullGrant: T
): Record<string, T> {
  let restored = objectPermissions;
  for (const object of objects) {
    if (object.kind !== 'Standard Object' || !object.apiName) continue;
    if (Object.hasOwn(objectPermissions, object.apiName)) continue;
    if (restored === objectPermissions) restored = { ...objectPermissions };
    restored[object.apiName] = { ...fullGrant };
  }
  return restored;
}
