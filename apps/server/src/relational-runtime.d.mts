export type RelationalSnapshot = {
  state: unknown;
  rows: Record<string, unknown[]>;
  version: number;
  digest: string;
};
export type QueryClient = {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }>;
  release(): void;
};
export type QueryPool = {
  connect(): Promise<QueryClient>;
};
export function readRelationalState(pool: QueryPool): Promise<RelationalSnapshot>;
export function writeRelationalState(pool: QueryPool, nextState: unknown, previous: RelationalSnapshot, beforeCommit?: ((client:QueryClient,state:unknown)=>Promise<void>)|null): Promise<RelationalSnapshot>;
