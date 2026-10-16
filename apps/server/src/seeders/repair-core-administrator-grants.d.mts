/** Type declaration for the runtime metadata-only Core seeder. */
export declare function restoreMissingCoreAdministratorGrants<
  T extends Record<string, unknown>
>(
  objectPermissions: T,
  objects: readonly { apiName: string; kind: string }[],
  fullGrant: {
    read: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
    viewAll: boolean;
    modifyAll: boolean;
  }
): T;
