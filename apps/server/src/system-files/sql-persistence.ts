import { Pool, type PoolClient, type QueryResultRow } from 'pg';
export function resolveSqlConnection(databaseUrl:string,env:NodeJS.ProcessEnv) {
  if(!databaseUrl)throw new Error('DATABASE_URL is required');
  const uri=new URL(databaseUrl);
  if(!['postgres:','postgresql:'].includes(uri.protocol))throw new Error('Invalid PostgreSQL connection URL');
  const override=env.METADRIVE_DB_NAME_OVERRIDE?.trim();
  if(override) {
    if(!/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(override))throw new Error('Invalid database name override');
    uri.pathname='/'+override;
  }
  const raw=env.METADRIVE_DB_CA_CERT?.trim();
  if(!raw)return {connectionString:uri.toString()};
  const candidate=raw.includes('BEGIN CERTIFICATE')?raw.replace(/\\n/g,'\n'):Buffer.from(raw,'base64').toString('utf8');
  if(!candidate.includes('-----BEGIN CERTIFICATE-----')||!candidate.includes('-----END CERTIFICATE-----'))
    throw new Error('Invalid configured PostgreSQL CA certificate');
  // pg-connection-string gives sslmode precedence over explicit ssl options.
  // Remove it so node TLS uses this CA and still verifies the server identity.
  uri.searchParams.delete('sslmode');
  uri.searchParams.delete('sslrootcert');
  return {
    connectionString:uri.toString(),
    ssl:{ca:candidate,rejectUnauthorized:true,servername:uri.hostname}
  };
}
export class SqlPersistence {
  readonly pool: Pool;
  constructor(databaseUrl: string) {
    if (!databaseUrl) throw new Error('DATABASE_URL is required; JSON fallback is forbidden');
    // Aiven's dedicated SQL database is selected by environment configuration.
    // Retain TLS and credential options from the original DATABASE_URL.
    const config=resolveSqlConnection(databaseUrl,process.env);
    this.pool = new Pool({ ...config, max: 10, connectionTimeoutMillis: 10000 });
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
    const names=["md_tenants","md_users","md_tenant_domains","md_sessions","md_refresh_sessions","md_roles","md_user_roles","md_permission_sets","md_permission_assignments","md_role_permission_sets","md_permission_rules","md_object_definitions","md_field_definitions","md_records","md_record_values","md_component_definitions","md_component_properties","md_page_definitions","md_page_components","md_page_properties","md_flow_definitions","md_flow_nodes","md_flow_edges","md_flow_runs","md_apps","md_app_installations","md_app_entitlements","md_app_home_pages","md_flow_node_properties","md_flow_run_inputs"];
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
