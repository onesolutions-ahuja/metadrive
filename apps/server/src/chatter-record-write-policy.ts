import { isWhatsAppMessage } from './chatter-authorisation.js';
type Row = Record<string, unknown>;
const obj=(value:unknown):Row|null=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:null;
const str=(value:unknown):string=>typeof value==='string'?value.trim().toLowerCase():'';
/**
 * Ordinary record APIs may never impersonate provider-originated WhatsApp events
 * or mutate message ownership/channel metadata. Internal webhook and validated
 * Flows operate through trusted platform services, not these public APIs.
 */
export function protectedChatterRecordWrite(objectName:string, values:unknown, before?:unknown):boolean {
  if (objectName!=='Communication_Records__c') return false;
  const existing=obj(before);
  if (existing && isWhatsAppMessage(existing)) return true;
  if (Array.isArray(values)) return values.some(row=>protectedChatterRecordWrite(objectName,row,before));
  const row=obj(values);
  if (!row) return false;
  if (Array.isArray(row.records)) return row.records.some(record=>protectedChatterRecordWrite(objectName,record,before));
  if (str(row.Communication_Mode__c)==='whatsapp' || str(row.Event_Type__c)==='message'
    || str(row.Source__c)==='webhook') return true;
  return ['Channel_Account__c','Assigned_User__c','Provider_Message_Id__c']
    .some(field=>Object.prototype.hasOwnProperty.call(row,field));
}
