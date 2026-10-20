import type {ActionContext} from './ActionNodeShared.js';
import {prepareEmailDispatch} from '../../communication-engine/EmailDispatcher.js';
export async function executeActionEmailNode(context:ActionContext) {
 let config=context.config;
 if(config.actionType==='Email Alert'){
  const alertApi=config.emailAlertId;
  if(typeof alertApi!=='string'||!/^[A-Za-z][A-Za-z0-9_]*$/.test(alertApi))
   throw new Error('Email Alert requires a valid saved alert');
  const {rows}=await context.client.query<{
   object_api:string;credential_id:string;from_email:string;recipients:string;
   subject:string;body:string
  }>(`
   SELECT a.object_api,a.credential_id,a.from_email,a.recipients,a.subject,a.body
   FROM md_email_alert_details a
   JOIN md_system_definitions d ON d.tenant_id=a.tenant_id
    AND d.kind='email-alerts' AND d.api_name=a.alert_api_name AND d.enabled=true
   WHERE a.tenant_id=$1 AND a.alert_api_name=$2 FOR SHARE OF a,d`,
   [context.tenantId,alertApi]);
  const alert=rows[0];
  if(!alert)throw new Error('Email Alert is unavailable');
  const record=await context.client.query<{object_api:string}>(`
   SELECT object_api FROM md_flow_interview_records
   WHERE tenant_id=$1 AND run_id=$2 AND api_name='$Record' AND sort_order=0`,
   [context.tenantId,context.runId]);
  if(!record.rows[0]||alert.object_api!==record.rows[0].object_api)
   throw new Error('Email Alert does not match the triggering record');
  config={namedCredentialId:alert.credential_id,fromEmail:alert.from_email,
   recipients:alert.recipients,subject:alert.subject,body:alert.body};
 }
 if(typeof context.enqueueEmail!=='function')
  throw new Error('Flow email queue is not configured');
 const message=prepareEmailDispatch(config,context.resolve);
 await context.enqueueEmail(message);
}

