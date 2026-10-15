/** Public seeder registry contracts for the SQL persistence integration. */
export type SeedSqlClient = { query(sql: string, params?: unknown[]): Promise<{rows?: unknown[]}> };
export function recordInstalledAppPackageVersions(
  client: SeedSqlClient, state: unknown,
  catalog: {packages?: Array<{appKey:string;[key:string]:unknown}>}
): Promise<void>;
export function packageChecksum(definition: unknown): string;
export function applyVersionedSeed(client: SeedSqlClient, options: {
  tenantId:string;kind:'core'|'shared'|'app';key:string;version:string;
  definition:unknown;apply(client:SeedSqlClient,definition:unknown):Promise<void>;
}): Promise<{changed:boolean;version:string;checksum:string}>;
export function createTenantSeedRegistry(options: {coreTemplate:unknown;appCatalog:unknown}): unknown;
