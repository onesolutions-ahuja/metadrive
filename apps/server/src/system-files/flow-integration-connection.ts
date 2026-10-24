import type {SqlExecutor} from './sql-persistence.js';
import type {RbacEngine} from './rbac-engine.js';
const identifier=/^[A-Za-z][A-Za-z0-9_]*$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'
  &&!Array.isArray(value)?value as Record<string,unknown>:{};

/** Resolve provider operation to a tenant-scoped HTTPS Named Credential. */
export async function resolveFlowIntegrationCallout(db:SqlExecutor,rbac:RbacEngine,
 tenantId:string,userId:string,config:Record<string,unknown>):Promise<Record<string,unknown>> {
 if(!config.integrationConnectionId)return config;
 const connectionId=String(config.integrationConnectionId);
 const operationName=String(config.operation??'');
 if(!identifier.test(connectionId)||!identifier.test(operationName))
  throw new Error('Invalid Flow provider connection or operation');
 await rbac.require(tenantId,userId,'SystemDefinition:integration-connections','read');
 await rbac.require(tenantId,userId,'SystemDefinition:connector-providers','read');
 await rbac.require(tenantId,userId,'NamedCredential','read');
 const {rows:connections}=await db.query<{properties:unknown}>(`
  SELECT properties FROM md_system_definitions
  WHERE tenant_id=$1 AND kind='integration-connections' AND api_name=$2 AND enabled=true
 `,[tenantId,connectionId]);
 const connection=object(connections[0]?.properties);
 if(connection.status!=='ACTIVE')throw new Error('Integration connection is not active');
 const connectorKey=connection.connectorKey;
 if(typeof connectorKey!=='string'||!identifier.test(connectorKey))
  throw new Error('Invalid integration connector identity');
 const {rows:providers}=await db.query<{properties:unknown}>(`
  SELECT properties FROM md_system_definitions
  WHERE tenant_id=$1 AND kind='connector-providers' AND api_name=$2 AND enabled=true
 `,[tenantId,connectorKey]);
 const provider=object(providers[0]?.properties);
 if(provider.status!=='ACTIVE')throw new Error('Integration provider is not active');
 const operations=object(provider.operations);
 const operation=object(operations[operationName]);
 if(!['GET','POST','PUT','PATCH','DELETE'].includes(String(operation.method))
  ||typeof operation.path!=='string'||operation.path.length>2048
  ||operation.path.startsWith('/')||operation.path.includes('\\'))
  throw new Error('Integration operation is not configured');
 const credentialId=object(connection.configuration).namedCredentialId;
 if(typeof credentialId!=='string'||!uuid.test(credentialId))
  throw new Error('Integration connection requires an HTTPS Named Credential');
 const {rows:credentials}=await db.query<{base_url:string}>(`
  SELECT base_url FROM md_named_credentials
  WHERE tenant_id=$1 AND id=$2 AND enabled=true AND protocol='HTTPS'
 `,[tenantId,credentialId]);
 if(!credentials.length)throw new Error('Integration HTTPS credential is unavailable');
 // A provider may not redirect a connection's credentials to a different service.
 if(typeof provider.baseUrl==='string'&&provider.baseUrl){
  const configured=new URL(credentials[0].base_url),approved=new URL(provider.baseUrl);
  if(configured.origin!==approved.origin)
   throw new Error('Integration credential origin differs from provider');
 }
 if(config.path&&config.path!==operation.path||config.method&&config.method!==operation.method)
  throw new Error('Integration operation has been modified outside provider metadata');
 // Connector identity comes from installed metadata, not browser-supplied values.
 const channelId=typeof provider.channelId==='string'&&/^onesys_[a-z0-9_]+$/.test(provider.channelId)
  ?provider.channelId:undefined;
 return {...config,namedCredentialId:credentialId,
  method:operation.method,path:operation.path,
  ...(channelId?{systemChannelId:channelId,connectorApi:connectorKey,
   communicationLog:{...object(config.communicationLog),provider:channelId}}:{})};
}
