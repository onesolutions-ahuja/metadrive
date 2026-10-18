import type {SqlPersistence} from '../system-files/sql-persistence.js';
import type {RbacEngine} from '../system-files/rbac-engine.js';
import {NamedCredentialActions} from './named-credential-actions.js';
const identifier=/^[A-Za-z][A-Za-z0-9_]*$|^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export class IntegrationConnectionRuntime {
 constructor(private readonly db:SqlPersistence,private readonly rbac:RbacEngine,
 private readonly credentials:NamedCredentialActions){}
 async test(tenantId:string,userId:string,id:string){
  if(!identifier.test(id))throw new Error('Invalid integration connection ID');
  await this.rbac.require(tenantId,userId,'SystemDefinition:integration-connections','manage');
  const {rows}=await this.db.query<{api_name:string;label:string;properties:Record<string,unknown>;revision:number}>(
   "SELECT api_name,label,properties,revision FROM md_system_definitions WHERE tenant_id=$1 AND kind='integration-connections' AND api_name=$2 AND enabled=true",
   [tenantId,id]);
  const found=rows[0];if(!found)throw new Error('Integration connection not found');
  const props=found.properties??{},configuration=props.configuration;
  const config=configuration&&typeof configuration==='object'&&!Array.isArray(configuration)
   ?configuration as Record<string,unknown>:{};
  const credentialId=config.namedCredentialId??props.namedCredentialId??config.credentialId;
  let testStatus:'Connected'|'Failed'|'Not configured'='Not configured';
  let message='Attach a tenant Named Credential to test the integration';
  if(typeof credentialId==='string'&&credentialId){
   try{
    const checked=await this.credentials.test(tenantId,userId,credentialId);
    testStatus=checked.connected?'Connected':'Failed';
    message=checked.message+(typeof checked.status==='number'?' (HTTP '+checked.status+')':'');
   }catch(error){
    if(error instanceof Error&&error.message==='Permission denied')throw error;
    testStatus='Failed';
    message='Connection test failed; inspect credential and provider configuration';
   }
  }
  const testedAt=new Date().toISOString(),next={...props,
   testStatus,lastTestedAt:testedAt,lastTestMessage:message};
  const {rowCount}=await this.db.query(`
   UPDATE md_system_definitions SET properties=$4::jsonb,updated_at=now()
   WHERE tenant_id=$1 AND kind='integration-connections' AND api_name=$2 AND revision=$3`,
   [tenantId,id,found.revision,JSON.stringify(next)]);
  if(!rowCount)throw new Error('Integration connection was updated concurrently');
  return {connection:{...next,id:found.api_name,apiName:found.api_name,name:found.label,label:found.label}};
 }
}
