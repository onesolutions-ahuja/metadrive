import { Pool, type PoolClient, type QueryResultRow } from 'pg';
export class SqlPersistence {
  readonly pool: Pool;
  constructor(databaseUrl: string) {
    if (!databaseUrl) throw new Error('DATABASE_URL is required; JSON fallback is forbidden');
    this.pool = new Pool({ connectionString: databaseUrl, max: 10, connectionTimeoutMillis: 10000 });
  }
  query<T extends QueryResultRow = QueryResultRow>(sql: string, params: readonly unknown[] = []) {
    return this.pool.query<T>(sql, [...params]);
  }
  async transaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try { await client.query('BEGIN'); const value = await run(client); await client.query('COMMIT'); return value; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
  async verifySchema() {
    const names=["md_tenants","md_users","md_tenant_domains","md_sessions","md_refresh_sessions","md_roles","md_user_roles","md_permission_sets","md_permission_assignments","md_role_permission_sets","md_permission_rules","md_object_definitions","md_field_definitions","md_records","md_record_values","md_component_definitions","md_component_properties","md_page_definitions","md_page_components","md_page_properties","md_flow_definitions","md_flow_nodes","md_flow_edges","md_flow_runs","md_apps","md_app_installations","md_app_entitlements"];
    const {rows}=await this.query<{table_name:string}>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() AND table_name=ANY($1::text[])',
      [names]);
    const present=new Set(rows.map(row=>row.table_name));
    const missing=names.filter(name=>!present.has(name));
    if(missing.length)throw new Error('SQL system schema incomplete: '+missing.join(', '));
  }
  async close() { await this.pool.end(); }
}
export type SqlExecutor = Pick<SqlPersistence, 'query'>;
