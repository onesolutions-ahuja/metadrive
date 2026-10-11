export type NormalizedSnapshot = {
  state: unknown;
  version: number;
  digest: string;
  sourceDigest: string;
};
export type SqlQueryClient = {
  query(sql:string, params?:unknown[]):Promise<{rows:Record<string,unknown>[],rowCount?:number|null}>;
  release():void;
};
export type SqlPool={connect():Promise<SqlQueryClient>};
export function readNormalizedState(pool:SqlPool):Promise<NormalizedSnapshot>;
export function writeNormalizedState(pool:SqlPool,nextState:unknown,previous:NormalizedSnapshot):Promise<NormalizedSnapshot>;
