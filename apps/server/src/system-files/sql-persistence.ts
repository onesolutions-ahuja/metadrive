import pg from 'pg';
const { Pool } = pg;
export class SqlPersistence {
  readonly pool: pg.Pool;
  constructor(databaseUrl: string) {
    if (!databaseUrl) throw new Error('DATABASE_URL is required; JSON fallback is forbidden');
    this.pool = new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 10000 });
  }
  query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: readonly unknown[] = []) {
    return this.pool.query<T>(sql, [...params]);
  }
  async transaction<T>(run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const value = await run(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async close() { await this.pool.end(); }
}
export type SqlExecutor = Pick<SqlPersistence, 'query'>;
