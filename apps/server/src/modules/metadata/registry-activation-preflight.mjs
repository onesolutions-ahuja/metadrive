/**
 * Phase 2 SQL gate: validate source fidelity before activating the versioned
 * component registry. This is read-only and deliberately fails closed.
 * Tenant metadata must never be inferred from ordinal-only component rows.
 */
export const requiredTables={
 metadrive_rel_library_components:['position','payload'],
 metadrive_rel_tenants:['tenant_id'],
 metadrive_rel_runtime:['id','version','state_sha256'],
 metadrive_rel_migrations:['revision','source_sha256']
};
export function assessRegistrySource(columns,counts){
 const errors=[];
 for(const [table,names] of Object.entries(requiredTables)){
  const observed=new Set(columns[table]??[]);
  for(const column of names)if(!observed.has(column))errors.push(table+'.'+column+' missing');
 }
 if(!Number.isSafeInteger(counts.components)||counts.components<0)
  errors.push('Invalid source component count');
 if(!Number.isSafeInteger(counts.migrations)||counts.migrations!==1)
  errors.push('Unverified relational migration marker');
 if(!Number.isSafeInteger(counts.revisions)||counts.revisions!==1)
  errors.push('Unverified relational revision marker');
 return {ready:errors.length===0,errors,componentCount:counts.components};
}
export async function inspectRegistrySource(client){
 const tables=Object.keys(requiredTables);
 const result=await client.query(
  'SELECT table_name,column_name FROM information_schema.columns '+
  'WHERE table_schema=$1 AND table_name=ANY($2::text[])',
  ['public',tables]
 );
 const columns=Object.fromEntries(tables.map(t=>[t,[]]));
 for(const row of result.rows){
  if(Object.hasOwn(columns,row.table_name))columns[row.table_name].push(row.column_name);
 }
 const counts=await client.query(
  'SELECT (SELECT count(*) FROM metadrive_rel_library_components) AS components, '+
  '(SELECT count(*) FROM metadrive_rel_migrations) AS migrations, '+
  '(SELECT count(*) FROM metadrive_rel_runtime) AS revisions'
 );
 const row=counts.rows[0]??{};
 return assessRegistrySource(columns,{
  components:Number(row.components),migrations:Number(row.migrations),revisions:Number(row.revisions)
 });
}
