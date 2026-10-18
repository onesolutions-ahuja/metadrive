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
export function resolveSqlPoolSize(env:NodeJS.ProcessEnv):number {
  const raw=env.METADRIVE_DB_POOL_MAX?.trim();
  if(!raw)return 5; // Leave headroom for additional replicas, workers and administrative connections.
  if(!/^[1-9][0-9]*$/.test(raw))throw new Error('Invalid SQL connection pool size');
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value>50)throw new Error('Invalid SQL connection pool size');
  return value;
}
export class SqlPersistence {
  readonly pool: Pool;
  constructor(databaseUrl: string) {
    if (!databaseUrl) throw new Error('DATABASE_URL is required; JSON fallback is forbidden');
    // Aiven's dedicated SQL database is selected by environment configuration.
    // Retain TLS and credential options from the original DATABASE_URL.
    const config=resolveSqlConnection(databaseUrl,process.env);
    this.pool = new Pool({ ...config, max: resolveSqlPoolSize(process.env), connectionTimeoutMillis: 10000 });
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
    const names=["md_rbac_revisions","md_permission_set_groups","md_permission_group_sets","md_permission_group_mutes","md_user_permission_groups","md_access_groups","md_access_group_members","md_queue_objects","md_sharing_settings","md_record_policies","md_policy_owner_roles","md_policy_conditions","md_policy_condition_values","md_tenants","md_users","md_tenant_domains","md_sessions","md_refresh_sessions","md_roles","md_user_roles","md_permission_sets","md_permission_assignments","md_role_permission_sets","md_permission_rules","md_object_definitions","md_field_definitions","md_field_picklist_values","md_records","md_record_values","md_component_definitions","md_component_properties","md_page_definitions","md_page_components","md_page_properties","md_flow_definitions","md_flow_nodes","md_flow_edges","md_flow_runs","md_flow_editor_values","md_flow_interview_state","md_flow_interview_values","md_apps","md_tenant_app_metadata","md_tenant_app_navigation","md_tenant_app_utilities","md_app_installations","md_app_entitlements","md_app_home_pages","md_flow_node_properties","md_flow_run_inputs","md_initial_password_rotations","md_page_component_properties","md_app_seed_pages","md_system_definitions","md_named_credentials","md_app_route_aliases","md_tenant_settings","md_tenant_lifecycle_audit","md_object_layout_versions","md_object_page_layouts","md_object_page_layout_sections","md_object_page_layout_fields","md_object_page_layout_actions","md_object_page_layout_related_lists","md_object_page_layout_links","md_object_page_layout_assignments","md_lightning_page_details","md_lightning_page_nodes","md_lightning_page_node_properties","md_lightning_page_activation","md_profiles","md_user_profiles","md_profile_permission_sets","md_object_record_types","md_object_record_type_values","md_bootstrap_password_repairs","md_tenant_provisioning_requests","md_notifications","md_approval_requests","md_record_activities","md_record_chatter_posts","md_record_chatter_comments","md_password_recovery_settings","md_security_events","md_record_history","md_component_library_versions","md_component_library_heads"];
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
