/** Type declaration for bundled metadata component registration. */
export declare function ensureBundledAppComponents<T>(library: T[], tenant: unknown, catalog: unknown, bundledRoot: string): T[];
export declare function pruneRetiredTrustedComponents<T>(library: T[], catalog: unknown): T[];
