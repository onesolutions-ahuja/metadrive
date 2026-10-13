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
export type NormalizedRecordHook=(client:SqlQueryClient,state:unknown,previousState?:unknown)=>Promise<void>;
export function readNormalizedState(pool:SqlPool,verifyPhysicalRecords?:NormalizedRecordHook|null):Promise<NormalizedSnapshot>;
export function writeNormalizedState(pool:SqlPool,nextState:unknown,previous:NormalizedSnapshot,synchronizePhysicalRecords?:NormalizedRecordHook|null,alreadyNormalized?:boolean):Promise<NormalizedSnapshot>;
