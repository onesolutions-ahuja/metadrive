/** Type declaration for the metadata-only package installer. */
export declare function applyInstallableAppPackages<T>(tenant: T, catalog: unknown): T;
export declare function retireUninstalledPackageMetadata<T>(tenant: T, catalog: unknown): T;
export declare function repairHistoricPackageRecordAudits(raw: unknown, catalog: unknown): boolean;
