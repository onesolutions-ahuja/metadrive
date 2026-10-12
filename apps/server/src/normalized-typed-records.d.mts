import type {SqlQueryClient} from './normalized-state-runtime.mjs';
export function synchronizeTypedRecords(client:SqlQueryClient,state:unknown,previousState?:unknown):Promise<void>;
export function verifyTypedRecords(client:SqlQueryClient,state:unknown):Promise<void>;
