/**
 * Idempotent Core metadata grant repair for explicitly seeded full-tenant
 * administration policies. Repairs only missing Standard Object entries.
 *
 * Important: an existing entry (including an explicit deny) is administrator
 * authored and is never changed. App-specific Custom Objects continue to be
 * provisioned exclusively by AppExchange/OneEngine installation.
 */
export function restoreMissingCoreAdministratorGrants(objectPermissions, objects, fullGrant) {
  if (!objectPermissions || !Array.isArray(objects) || !fullGrant)
    throw new Error('OneEngine administrator grant metadata is required');
  let result = objectPermissions;
  for (const object of objects) {
    if (object?.kind !== 'Standard Object' || typeof object.apiName !== 'string') continue;
    if (Object.hasOwn(objectPermissions, object.apiName)) continue;
    if (result === objectPermissions) result = { ...objectPermissions };
    result[object.apiName] = { ...fullGrant };
  }
  return result;
}
