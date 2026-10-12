import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openRecoveryCase } from '../src/tenant-recovery-cases.mjs';
import { approveRecoveryCase, issueRecoveryInvitation, redeemRecoveryInvitation } from '../src/tenant-recovery-transaction.mjs';

test('MD-03.7: isolated PostgreSQL recovery approval, invitation, redemption, single use and immutable audit', async t => {
  const url=process.env.METADRIVE_TEST_DATABASE_URL;
  if(!url) return t.skip('Requires isolated CI PostgreSQL URL');
  // Never run this destructive fixture in production or against a tenant DB.
  if(process.env.CI!=='true')return t.skip('Disposable GitHub CI database only');
  const {Pool}=pg, unique=randomBytes(5).toString('hex');
  const name='md_recovery_ci_'+unique;
  const admin=new Pool({connectionString:url,max:2});
  const address=new URL(url);
  let pool;
  try {
    await admin.query('CREATE DATABASE "'+name+'"');
    address.pathname='/'+name;
    pool=new Pool({connectionString:address.toString(),max:4});
    const sql=readFileSync(fileURLToPath(new URL('../sql/tenant-recovery-control.sql',import.meta.url)),'utf8');
    // This is a fully isolated database: it never touches tenant runtime tables.
    await pool.query(sql);
    const createdAt=new Date('2026-10-13T09:00:00Z');
    const now=new Date('2026-10-15T12:00:00Z');
    const requestor={id:'platform-intake',role:'recovery_intake',active:true,trustedMfa:true};
    const created=await openRecoveryCase(pool,{tenantId:'testtenant',claimantUserId:'claimant-1',requester:requestor,now:createdAt});
    assert.match(created.caseId,/^[0-9a-f-]{36}$/);
    await assert.rejects(openRecoveryCase(pool,{tenantId:'testtenant',claimantUserId:'claimant-1',requester:requestor,now:createdAt}));
    const operator=id=>({id,role:'recovery_operator',active:true,trustedMfa:true});
    await assert.rejects(approveRecoveryCase(pool,{caseId:created.caseId,operator:operator('platform-op-a'),now}));
    await pool.query(
      "UPDATE tenant_recovery_cases SET identity_proof_status='verified',out_of_band_verified=true,contacts_notified=true,notification_dispatch_complete=true WHERE id=$1",
      [created.caseId]);
    await assert.rejects(approveRecoveryCase(pool,{caseId:created.caseId,operator:operator('platform-intake'),now}));
    await approveRecoveryCase(pool,{caseId:created.caseId,operator:operator('platform-op-a'),now});
    await assert.rejects(approveRecoveryCase(pool,{caseId:created.caseId,operator:operator('platform-op-a'),now}));
    await assert.rejects(issueRecoveryInvitation(pool,{caseId:created.caseId,operator:operator('platform-op-b'),now}));
    await approveRecoveryCase(pool,{caseId:created.caseId,operator:operator('platform-op-b'),now});
    let privateDelivery;
    const receipt=await issueRecoveryInvitation(pool,{caseId:created.caseId,operator:operator('platform-op-c'),now,
      deliverToVerifiedContact:async msg=>{privateDelivery=msg;}});
    assert.equal(receipt.delivered,true);
    assert.equal('token' in receipt,false,'Platform operator must not receive a redeemable invitation');
    assert.equal(privateDelivery.tenantId,'testtenant');
    const claimant={id:'claimant-1',active:true,trustedMfa:true};
    await assert.rejects(redeemRecoveryInvitation(pool,{caseId:created.caseId,tenantId:'wrongtenant',
      claimant,token:privateDelivery.token,now}));
    const redemption=await redeemRecoveryInvitation(pool,{caseId:created.caseId,tenantId:'testtenant',
      claimant,token:privateDelivery.token,now});
    assert.equal(redemption.scope,'tenant_admin_repair_only');
    assert.equal(redemption.requiresRestrictedTenantRepair,true);
    const grant=await pool.query('SELECT * FROM tenant_recovery_repair_grants WHERE case_id=$1',[created.caseId]);
    assert.equal(grant.rowCount,1);
    assert.equal(grant.rows[0].claimant_user_id,'claimant-1');
    await assert.rejects(redeemRecoveryInvitation(pool,{caseId:created.caseId,tenantId:'testtenant',
      claimant,token:privateDelivery.token,now}), 'Invitation cannot replay');
    const events=await pool.query('SELECT event_type FROM tenant_recovery_events WHERE case_id=$1 ORDER BY id',[created.caseId]);
    assert.ok(events.rows.some(r=>r.event_type==='invitation_redeemed'));
    await assert.rejects(pool.query('DELETE FROM tenant_recovery_events WHERE case_id=$1',[created.caseId]),
      'Audit trigger must reject mutation');
    const step=await pool.query('INSERT INTO tenant_recovery_mfa_steps(user_id,time_step) VALUES($1,$2) RETURNING user_id',['platform-op-a',123]);
    assert.equal(step.rowCount,1);
    const replay=await pool.query('INSERT INTO tenant_recovery_mfa_steps(user_id,time_step) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING user_id',['platform-op-a',123]);
    assert.equal(replay.rowCount,0);
  } finally {
    if(pool)await pool.end();
    await admin.query('DROP DATABASE IF EXISTS "'+name+'"').catch(()=>{});
    await admin.end();
  }
});
