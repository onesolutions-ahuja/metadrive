import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createIntegrationCommunicationWriter,IntegrationCommunicationOutbox,
 writeIntegrationActivity} from '../../src/system-support/integration-api-log.js';

function fakeSqlWriter(){
 const saved:Record<string,string>={};
 const calls:string[]=[];
 const client={query:async(sql:string,params:unknown[]=[])=>{
  calls.push(sql);
  if(sql.includes('FROM md_tenants'))return {rows:[{id:'tenant-a'}]};
  if(sql.includes('FROM md_records r'))return {rows:[]};
  if(sql.includes('FROM md_field_definitions'))
   return {rows:(params[1] as string[]).map(api_name=>({api_name}))};
  if(sql.includes('INSERT INTO md_records'))return {rows:[{id:'record-a'}]};
  if(sql.includes('INSERT INTO md_record_values')){
   const fields=params[2] as string[],values=params[3] as string[];
   for(let index=0;index<fields.length;index++)saved[fields[index]]=values[index];
  }
  return {rows:[]};
 }};
 const db={transaction:async<T>(run:(tx:typeof client)=>Promise<T>)=>run(client)} as never;
 return {db,calls,saved};
}

test('central SQL Communication writer records outbound calls without a user or RBAC',async()=>{
 const {db,calls,saved}=fakeSqlWriter();
 await writeIntegrationActivity(db,{
  tenantId:'tenant-a',direction:'Outbound',provider:'WhatsApp Credential',
  endpoint:'https://provider.example/messages?access_token=secret',
  method:'POST',statusCode:200,outcome:'success',durationMs:15,
  requestBytes:48,responseBytes:25
 },createIntegrationCommunicationWriter(db));
 assert.equal(saved.Direction,'Outbound');
 assert.equal(saved.Channel,'Other');
 assert.equal(saved.Status,'Sent');
 assert.equal(saved.Recipient,'https://provider.example/messages');
 assert.equal(saved.RelatedObject,'IntegrationApiCall');
 assert.match(saved.Subject,/POST 200/);
 assert.match(saved.Body,/requestBytes/);
 assert.doesNotMatch(JSON.stringify(saved),/access_token|secret/);
 assert.ok(calls.some(sql=>sql.includes('INSERT INTO md_record_values')));
 assert.ok(calls.every(sql=>!sql.includes('md_rbac_decision')&&!sql.includes('md_users')));
});

test('metadata mapping records a message with provider ID using system SQL',async()=>{
 const {db,saved}=fakeSqlWriter();
 await createIntegrationCommunicationWriter(db)({
  tenantId:'tenant-a',direction:'Outbound',transport:'HTTP',provider:'WhatsApp',
  endpoint:'https://graph.example/messages',method:'POST',statusCode:200,
  outcome:'success',communication:{channel:'WhatsApp',
   recipient:'447700900123',body:'Hello',externalMessageId:'wamid.123'}
 });
 assert.equal(saved.Channel,'WhatsApp');
 assert.equal(saved.Body,'Hello');
 assert.equal(saved.Recipient,'447700900123');
 assert.equal(saved.ExternalMessageId,'wamid.123');
});

test('SMTP delivery logs Email through the same system SQL writer',async()=>{
 const {db,saved}=fakeSqlWriter();
 await createIntegrationCommunicationWriter(db)({
  tenantId:'tenant-a',direction:'Outbound',transport:'SMTP',provider:'Tenant Mail',
  endpoint:'smtp://mail.example:587',method:'SMTP',outcome:'success',
  communication:{channel:'Email',relatedObject:'NamedCredential'}
 });
 assert.equal(saved.Direction,'Outbound');
 assert.equal(saved.Channel,'Email');
 assert.equal(saved.Status,'Sent');
 assert.equal(saved.Sender,'MetaDrive');
 assert.match(saved.Subject,/SMTP NO_RESPONSE/);
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
