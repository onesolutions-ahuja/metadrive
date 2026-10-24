import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {PoolClient} from 'pg';
import {installConnectorApp,uninstallConnectorApp} from '../../src/app-seeders/connector-apps.js';

type Query={sql:string;args:unknown[]};
const fakeClient=(provisioned=true)=>{
 const writes:Query[]=[];
 const client={
  query:async(sql:string,args:unknown[]=[]):Promise<{rows:Record<string,unknown>[];rowCount:number}>=>{
   writes.push({sql,args});
   if(sql.includes('SELECT id FROM md_apps'))return {rows:[{id:'connector-app-1'}],rowCount:1};
   if(sql.includes('INSERT INTO md_named_credentials'))return {rows:[{id:'cred-1'}],rowCount:1};
   if(sql.includes('SELECT credential_id,provisioned FROM md_connector_app_credentials'))
    return {rows:[{credential_id:'cred-1',provisioned}],rowCount:1};
   if(sql.includes('SELECT EXISTS(SELECT 1 FROM md_connector_app_credentials'))
    return {rows:[{in_use:false}],rowCount:1};
   return {rows:[],rowCount:1};
  }
 } as unknown as PoolClient;
 return {client,writes};
};

test('six independently defined connector apps provision only tenant-scoped non-secret metadata',async()=>{
 const names=[
  'WhatsAppConnector','SmsGateConnector','BrevoConnector',
  'UberEatsConnector','DeliverooConnector','JustEatConnector'
 ] as const;
 for(const name of names){
  const {client,writes}=fakeClient();
  await installConnectorApp(client,'tenant-1',name);
  const credential=writes.find(w=>w.sql.includes('INSERT INTO md_named_credentials'));
  assert.ok(credential,name);
  assert.equal(credential.args[0],'tenant-1');
  const channelName='onesys_'+({WhatsAppConnector:'whatsapp',SmsGateConnector:'sms_gate',BrevoConnector:'brevo',
      UberEatsConnector:'uber_eats',DeliverooConnector:'deliveroo',JustEatConnector:'just_eat'} as Record<string,string>)[name];
  assert.equal(credential.args[1],channelName);
  const provider=writes.find(w=>w.sql.includes("'connector-providers'"));
  assert.ok(provider);
  const providerMetadata=JSON.parse(String(provider.args[3]));
  assert.equal(providerMetadata.channelId,channelName);
  assert.equal(providerMetadata.credentialName,channelName);
  if(name==='WhatsAppConnector'){
   assert.equal(providerMetadata.communicationChannel,'WhatsApp');
   assert.deepEqual(providerMetadata.defaultCommunicationFields,{
    recipient:'to',body:'text.body',responseId:'messages[0].id'
   });
  }
  assert.ok(writes.some(w=>w.sql.includes(
   'properties=EXCLUDED.properties || md_system_definitions.properties')),
   'Reinstall must add missing connector metadata while preserving tenant overrides');
  assert.equal(credential.args[3]?.toString().startsWith('https://'),true);
  assert.equal(credential.args.length,6,'No tenant secret belongs in a connector definition');
  assert.ok(writes.some(w=>w.sql.includes("kind,api_name,label,properties,enabled")));
  const fields=writes.filter(w=>w.sql.includes('INSERT INTO md_connector_app_fields'));
  assert.deepEqual(fields.map(w=>w.args[3]),name==='WhatsAppConnector'?['public_phoneNumberId']:[],
    name+' must provision only required non-secret variables');
  assert.ok(fields.every(w=>w.args[5]===true),'Seeded configuration variables must be required');
  const cleanup=writes.find(w=>w.sql.includes('DELETE FROM md_connector_app_fields'));
  assert.ok(cleanup,'Reinstall must prune obsolete package-managed fields');
  assert.deepEqual(cleanup.args[3],fields.map(w=>w.args[3]));
  assert.ok(!writes.some(w=>w.sql.includes('DELETE FROM md_named_credentials')),
    'Pruning configuration field definitions must never delete credentials');
 }
});

test('uninstall disables provisioned credential but preserves ciphertext and settings',async()=>{
 const {client,writes}=fakeClient(true);
 await uninstallConnectorApp(client,'tenant-1','WhatsAppConnector');
 assert.ok(writes.some(w=>w.sql.includes('UPDATE md_named_credentials SET enabled=false')));
 assert.ok(writes.some(w=>w.sql.includes('UPDATE md_inbound_webhook_endpoints SET enabled=false')));
 assert.equal(writes.some(w=>/DELETE FROM md_named_credentials|secret_ciphertext\s*=|configuration_ciphertext\s*=/.test(w.sql)),false);
});

test('uninstall preserves a pre-existing tenant credential used by another app',async()=>{
 const {client,writes}=fakeClient(false);
 await uninstallConnectorApp(client,'tenant-1','WhatsAppConnector');
 assert.equal(writes.some(w=>w.sql.includes('UPDATE md_named_credentials SET enabled=false')),false);
 assert.equal(writes.some(w=>w.sql.includes('UPDATE md_inbound_webhook_endpoints SET enabled=false')),false);
 assert.ok(writes.some(w=>w.sql.includes('UPDATE md_system_definitions SET enabled=false')));
});
