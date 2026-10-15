export function sanitizeChatterCallerInput(apiName: string, input: Record<string, unknown>): Record<string, unknown>;
export function trustedChatterExecutionFlow<T extends {resources:Array<{name:string;availableForInput:boolean}>}>(flow:T, authorizedInput:Record<string,unknown>):T;
