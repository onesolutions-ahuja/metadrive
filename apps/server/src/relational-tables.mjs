// Shared fixed SQL table codec for staging and relational runtime.
// API names, fields and record values always travel as query parameters.
export const relationalTables=[
      ['tenants','metadrive_rel_tenants','tenant_id',r=>[r.tenantId],r=>({tenantId:r.tenant_id})],
      ['objects','metadrive_rel_objects','tenant_id,object_api_name,position,payload',r=>[r.tenantId,r.apiName,r.position,JSON.stringify(r.payload)],r=>({tenantId:r.tenant_id,apiName:r.object_api_name,position:r.position,payload:r.payload})],
      ['collections','metadrive_rel_tenant_collections','tenant_id,collection_name',r=>[r.tenantId,r.key],r=>({tenantId:r.tenant_id,key:r.collection_name})],
      ['collectionItems','metadrive_rel_tenant_collection_items','tenant_id,collection_name,position,payload',r=>[r.tenantId,r.key,r.position,JSON.stringify(r.payload)],r=>({tenantId:r.tenant_id,key:r.collection_name,position:r.position,payload:r.payload})],
      ['settings','metadrive_rel_tenant_settings','tenant_id,setting_name,payload',r=>[r.tenantId,r.key,JSON.stringify(r.payload)],r=>({tenantId:r.tenant_id,key:r.setting_name,payload:r.payload})],
      ['recordBuckets','metadrive_rel_record_buckets','tenant_id,object_api_name,position',r=>[r.tenantId,r.objectApiName,r.position],r=>({tenantId:r.tenant_id,objectApiName:r.object_api_name,position:r.position})],
      ['records','metadrive_rel_records','tenant_id,object_api_name,record_id,position,payload',r=>[r.tenantId,r.objectApiName,r.id,r.position,JSON.stringify(r.payload)],r=>({tenantId:r.tenant_id,objectApiName:r.object_api_name,id:r.record_id,position:r.position,payload:r.payload})],
      ['users','metadrive_rel_users','position,user_id,tenant_id,name,email,password_salt,password_hash,role,permission_set_ids,permission_set_group_ids,disabled,created_at,extra',r=>[r.position,r.id,r.tenantId,r.name,r.email,r.passwordSalt,r.passwordHash,r.role,JSON.stringify(r.permissionSetIds),JSON.stringify(r.permissionSetGroupIds),r.disabled,r.createdAt,JSON.stringify(r.extra)],r=>({position:r.position,id:r.user_id,tenantId:r.tenant_id,name:r.name,email:r.email,passwordSalt:r.password_salt,passwordHash:r.password_hash,role:r.role,permissionSetIds:r.permission_set_ids,permissionSetGroupIds:r.permission_set_group_ids,disabled:r.disabled,createdAt:r.created_at,extra:r.extra})],
      ['sessions','metadrive_rel_refresh_sessions','position,token_hash,family_id,user_id,tenant_id,expires_at,used_at,revoked_at,extra',r=>[r.position,r.tokenHash,r.familyId,r.userId,r.tenantId,r.expiresAt,r.usedAt,r.revokedAt,JSON.stringify(r.extra)],r=>({position:r.position,tokenHash:r.token_hash,familyId:r.family_id,userId:r.user_id,tenantId:r.tenant_id,expiresAt:r.expires_at,usedAt:r.used_at,revokedAt:r.revoked_at,extra:r.extra})],
      ['revokedTokens','metadrive_rel_revoked_tokens','token_hash,expires_at',r=>[r.tokenHash,r.expiresAt],r=>({tokenHash:r.token_hash,expiresAt:r.expires_at})],
      ['components','metadrive_rel_library_components','position,payload',r=>[r.position,JSON.stringify(r.payload)],r=>({position:r.position,payload:r.payload})],
      ['platformSettings','metadrive_rel_platform_settings','setting_name,payload',r=>[r.key,JSON.stringify(r.payload)],r=>({key:r.setting_name,payload:r.payload})]
    ];

export const keyFor = {
  tenants:r=>[r.tenantId],
  objects:r=>[r.tenantId,r.apiName],
  collections:r=>[r.tenantId,r.key],
  collectionItems:r=>[r.tenantId,r.key,r.position],
  settings:r=>[r.tenantId,r.key],
  recordBuckets:r=>[r.tenantId,r.objectApiName],
  records:r=>[r.tenantId,r.objectApiName,r.id],
  users:r=>[r.id],
  sessions:r=>[r.tokenHash],
  revokedTokens:r=>[r.tokenHash],
  components:r=>[r.position],
  platformSettings:r=>[r.key]
};
export async function readRelationalRows(client) {
  const rows={};
  for (const [key,table,,,parseRow] of relationalTables) {
    const result=await client.query('SELECT * FROM '+table);
    rows[key]=result.rows.map(parseRow);
  }
  return rows;
}
