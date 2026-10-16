import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { IntegrationOutbox } from '../dist/connector-outbox.js';

const connectionString = process.env.METADRIVE_TEST_DATABASE_URL;
test('Module 11 SQL outbox survives lease expiry without cross-tenant claims or duplicate sends',
  { skip: !connectionString && 'Isolated PostgreSQL required' }, async () => {
  const pool = new pg.Pool({ connectionString, ssl: false });
  const client = await pool.connect();
  const schema = 'md11_outbox_' + randomUUID().replaceAll('-', '');
  try {
    await client.query('CREATE SCHEMA "' + schema + '"');
    await client.query('SET search_path TO "' + schema + '"');
    const outbox = new IntegrationOutbox(client);
    assert.equal(await outbox.ready(), false, 'scheduler must skip absent Module 11 schema');
    await client.query(readFileSync(new URL('../sql/module11-integration-outbox.sql', import.meta.url),'utf8'));
    assert.equal(await outbox.ready(), true, 'scheduler must activate once table is installed');
    const item = {tenantId:'A',credentialId:'provider',operationKey:'order-1',method:'POST',path:'/v1/order',encryptedRequest:'enc:encrypted-content',maxAttempts:2};
    const aId=await outbox.enqueue(item);
    assert.equal(await outbox.enqueue({...item,encryptedRequest:'enc:changed'}),aId);
    const bId=await outbox.enqueue({...item,tenantId:'B'});
    assert.notEqual(aId,bId);
    const aClaim=await outbox.claim('A','worker-A',20,1000);
    assert.deepEqual(aClaim.map(row=>row.id),[aId]);
    await assert.rejects(outbox.complete('B','worker-A',aId,200),/OUTBOX_LEASE_LOST/);
    await outbox.fail('A','worker-A',aId,'HTTP_RATE_LIMIT',0);
    const second=await outbox.claim('A','worker-B',20,1000);
    assert.deepEqual(second.map(row=>row.id),[aId]);
    assert.equal(second[0].attempts,2);
    await client.query("UPDATE md_integration_outbox SET lease_until=now()-interval '1 second' WHERE id=$1",[aId]);
    assert.equal((await outbox.claim('A','worker-C',20,1000)).length,0);
    const exhausted=await client.query('SELECT status,encrypted_request FROM md_integration_outbox WHERE id=$1',[aId]);
    assert.equal(exhausted.rows[0].status,'dead');
    assert.equal(exhausted.rows[0].encrypted_request,'');
    const bClaim=await outbox.claim('B','worker-B',20,1000);
    assert.deepEqual(bClaim.map(row=>row.id),[bId]);
    await outbox.complete('B','worker-B',bId,201);
    const finished=await client.query('SELECT status,encrypted_request FROM md_integration_outbox WHERE id=$1',[bId]);
    assert.equal(finished.rows[0].status,'succeeded');
    assert.equal(finished.rows[0].encrypted_request,'');
    const forbidden=await client.query("SELECT count(*)::integer AS n FROM information_schema.columns WHERE table_schema=$1 AND data_type IN ('json','jsonb')",[schema]);
    assert.equal(forbidden.rows[0].n,0);
  } finally {
    await client.query('RESET search_path');
    await client.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
    client.release(); await pool.end();
  }
});
