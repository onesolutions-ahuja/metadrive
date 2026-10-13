declare module 'pg' {
  const pg: { Pool: new (options: Record<string, unknown>) => {
    query(sql: string, params?: unknown[]): Promise<{ rows: Array<{ payload?: unknown }> }>;
    connect(): Promise<{
      query(sql: string, params?: unknown[]): Promise<{ rows: Array<{ payload?: unknown }> }>;
      release(destroy?: boolean): void;
    }>;
    end(): Promise<void>;
  } };
  export default pg;
}
