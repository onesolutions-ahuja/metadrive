import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createIntegrationCommunicationWriter,IntegrationCommunicationOutbox,
 writeIntegrationActivity} from '../../src/system-support/integration-api-log.js';

test('central integration writer records every attempt as tenant-scoped Communication metadata',async()=>{
 let actor:string|undefined,object:string|undefined,values:Record<string,unknown>|undefined;
 const db={query:async(sql:string,params:unknown[]=[])=>{
  assert.match(sql,/md_communication_logger_accounts/);
  assert.match(sql,/u.enabled=true/);
  assert.doesNotMatch(sql,/md_tenant_developer_accounts/);
  assert.deepEqual(params,['tenant-a']);
  return {rows:[{user_id:'tenant-communication-writer'}]};
 }} as never;
 const records={create:async(tenant:string,user:string,api:string,record:Record<string,unknown>)=>{
  assert.equal(tenant,'tenant-a');actor=user;object=api;values=record;return 'record-id';
 }} as never;
 const writer=createIntegrationCommunicationWriter(db,records);
 await writeIntegrationActivity(db,{
  tenantId:'tenant-a',direction:'Outbound',provider:'WhatsApp Credential',
  credentialId:'credential-a',actorUserId:'user-a',
  endpoint:'https://provider.example/messages?access_token=secret',
  method:'POST',statusCode:200,outcome:'success',durationMs:15,
  requestBytes:48,responseBytes:25
 },writer);
 assert.equal(actor,'tenant-communication-writer');
 assert.equal(object,'Communication');
 assert.equal(values?.Direction,'Outbound');
 assert.equal(values?.OwnerId,'user-a');
 assert.equal(values?.Channel,'Other');
 assert.equal(values?.Status,'Sent');
 assert.equal(values?.Recipient,'https://provider.example/messages');
 assert.ok(values);
 assert.equal(Object.entries(values).filter(([,value])=>value===undefined).length,0,
  'Central writer must omit absent optional fields before generic RecordEngine validation');
 assert.equal(values?.RelatedObject,'IntegrationApiCall');
 assert.equal(values?.RelatedRecordId,'credential-a');
 assert.match(String(values?.Subject),/POST 200/);
 assert.match(String(values?.Body),/requestBytes/);
 assert.doesNotMatch(JSON.stringify(values),/access_token|secret/);
});

test('metadata mapping records one business Communication with the provider message ID',async()=>{
 let values:Record<string,unknown>|undefined;
 const db={query:async()=>({rows:[{user_id:'tenant-system-user'}]})} as never;
 const records={create:async(_tenant:string,_user:string,_object:string,record:Record<string,unknown>)=>{
  values=record;return 'record-id';
 }} as never;
 const writer=createIntegrationCommunicationWriter(db,records);
 await writer({
  tenantId:'tenant-a',direction:'Outbound',transport:'HTTP',provider:'WhatsApp',
  credentialId:'credential-a',actorUserId:'user-a',endpoint:'https://graph.example/v26.0/123/messages',
  method:'POST',statusCode:200,outcome:'success',durationMs:30,requestBytes:88,responseBytes:40,
  communication:{channel:'WhatsApp',name:'WhatsApp outbound',sender:'WhatsApp Business',
   recipient:'447700900123',body:'Hello',provider:'WhatsApp',externalMessageId:'wamid.123'}
 });
 assert.equal(values?.Channel,'WhatsApp');
 assert.equal(values?.Body,'Hello');
 assert.equal(values?.Recipient,'447700900123');
 assert.equal(values?.ExternalMessageId,'wamid.123');
 assert.match(String(values?.Subject),/POST 200/);
});

test('SMTP deliveries are recorded as outbound Email Communications',async()=>{
 let values:Record<string,unknown>|undefined;
 const db={query:async()=>({rows:[{user_id:'tenant-system-user'}]})} as never;
 const records={create:async(_tenant:string,_user:string,_object:string,record:Record<string,unknown>)=>{
  values=record;return 'record-id';
 }} as never;
 await createIntegrationCommunicationWriter(db,records)({
  tenantId:'tenant-a',direction:'Outbound',transport:'SMTP',provider:'Tenant Mail',
  credentialId:'smtp-credential',actorUserId:'user-a',endpoint:'smtp://mail.example:587',
  method:'SMTP',outcome:'success',durationMs:20,requestBytes:64,
  communication:{channel:'Email',name:'Outbound email',
   relatedObject:'NamedCredential',relatedRecordId:'smtp-credential'}
 });
 assert.equal(values?.Direction,'Outbound');
 assert.equal(values?.Channel,'Email');
 assert.equal(values?.Status,'Sent');
 assert.equal(values?.Sender,'MetaDrive');
 assert.equal(values?.Recipient,'smtp://mail.example:587');
 assert.equal(values?.RelatedObject,'NamedCredential');
 assert.equal(values?.RelatedRecordId,'smtp-credential');
 assert.match(String(values?.Subject),/SMTP NO_RESPONSE · success/);
 assert.doesNotMatch(JSON.stringify(values),/customer@example.com|Order update|Your order shipped/);
});

test('failed Communication writes remain in the SQL outbox and retry with a stable message ID',async()=>{
 type Row=Record<string,unknown>&{tenant_id:string;id:string;external_message_id:string;
  status:string;attempt_count:number;next_attempt_at:Date};
 const rows=new Map<string,Row>();
 const db={query:async(sql:string,params:unknown[]=[]):Promise<{rows:Array<Row>}>=>{
  if(sql.includes('INSERT INTO md_communication_delivery_outbox')){
   const row:Row={tenant_id:String(params[0]),id:String(params[1]),
    direction:String(params[2]),transport:String(params[3]),provider:String(params[4]),
    credential_id:params[5] as string|null,actor_user_id:params[6] as string|null,
    endpoint:String(params[7]),method:String(params[8]),status_code:params[9] as number|null,
    outcome:String(params[10]),duration_ms:Number(params[11]),request_bytes:Number(params[12]),
    response_bytes:Number(params[13]),error_code:params[14] as string|null,
    channel:String(params[15]),name:String(params[16]),sender:String(params[17]),
    recipient:String(params[18]),subject:params[19] as string|null,body:params[20] as string|null,
    external_message_id:String(params[21]),related_object:String(params[22]),
    related_record_id:params[23] as string|null,conversation_id:params[24] as string|null,
    received_at:params[25] as Date|string|null,sent_at:params[26] as Date|string|null,
    occurred_at:params[27] as string,status:'pending',attempt_count:0,next_attempt_at:new Date(0)};
   rows.set(row.id,row);return {rows:[]};
  }
  if(sql.includes('WITH candidate AS(')){
   const row=[...rows.values()].find(item=>item.status==='pending'
    &&(!params[0]||item.id===params[0]));
   if(!row)return {rows:[]};
   row.status='processing';row.attempt_count++;
   return {rows:[{...row}]};
  }
  if(sql.includes('FROM md_records r'))return {rows:[]};
  if(sql.includes('DELETE FROM md_communication_delivery_outbox')){
   rows.delete(String(params[1]));return {rows:[]};
  }
  if(sql.includes('UPDATE md_communication_delivery_outbox')){
   const row=rows.get(String(params[1]));
   if(row){row.status='pending';row.next_attempt_at=new Date(0);}
   return {rows:[]};
  }
  throw new Error('Unexpected SQL '+sql);
 }} as never;
 const written:string[]=[];
 let fail=true;
 const outbox=new IntegrationCommunicationOutbox(db,async input=>{
  const id=String(input.communication?.externalMessageId);
  written.push(id);
  if(fail){fail=false;throw new Error('temporary record write failure');}
 });
 await assert.doesNotReject(()=>outbox.write({
  tenantId:'tenant-a',direction:'Outbound',transport:'HTTP',provider:'Provider',
  endpoint:'https://provider.example/send',method:'POST',statusCode:200,outcome:'success'
 }));
 assert.equal(rows.size,1);
 assert.equal([...rows.values()][0].status,'pending');
 assert.equal(await outbox.dispatchOne(),true);
 assert.equal(rows.size,0);
 assert.equal(written.length,2);
 assert.equal(written[0],written[1]);
});

test('communication logging failures do not replace provider results or leak secrets',async()=>{
 const original=console.error;
 const diagnostics:string[]=[];
 console.error=(...args:unknown[])=>{
  const message=args.map(String).join(' ');
  diagnostics.push(message);
  assert.doesNotMatch(message,/secret|token|access_token|database failure/i);
 };
 try{
  await assert.doesNotReject(()=>writeIntegrationActivity(
   {query:async()=>{throw new Error('database failed with secret token');}} as never,{
    tenantId:'tenant-a',direction:'Outbound',transport:'HTTP',
    endpoint:'https://provider.example/messages?access_token=secret',method:'POST',
    statusCode:200,outcome:'success'
   },async()=>{throw new Error('database failure with secret token');}
  ));
  assert.match(diagnostics.join(' '),/Integration Communication write failed/);
  await assert.doesNotReject(()=>writeIntegrationActivity(
   {query:async()=>({rows:[]})} as never,{
    tenantId:'tenant-a',direction:'Outbound',transport:'HTTP',
    endpoint:'https://provider.example/messages',method:'POST',outcome:'success'
   }
  ));
  assert.match(diagnostics.join(' '),/WriterNotConfigured/);
 }finally{console.error=original;}
});
