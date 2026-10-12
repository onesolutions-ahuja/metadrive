export function normalizeTenantDomain(value: unknown): string;
export function domainChallenge(hostname: string, token: string): { type: 'TXT'; host: string; value: string };
export function matchesDomainChallenge(records: string[][], value: string): boolean;
export function reservedDomain(hostname: string, webOrigins: Iterable<string>): boolean;
export function verifiedHostTenant(registry: Record<string, { domains?: Array<{hostname:string;status:string}> }>, host: unknown): string | undefined;
