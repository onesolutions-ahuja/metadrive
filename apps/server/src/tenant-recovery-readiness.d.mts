export declare function assertRecoveryControlReadiness(pool: { query(sql: string, params: unknown[]): Promise<{ rows: unknown[] }> }, options?: { expectedDatabase?: string }): Promise<true>;
