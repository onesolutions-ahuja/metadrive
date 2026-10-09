declare module 'pg' {
  const pg: { Pool: new (options: Record<string, unknown>) => {
    query(sql: string, params?: unknown[]): Promise<{ rows: Array<{ payload?: unknown }> }>;
    end(): Promise<void>;
  } };
  export default pg;
}
