import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openRecoveryCase } from '../src/tenant-recovery-cases.mjs';
import { approveRecoveryCase, issueRecoveryInvitation, redeemRecoveryInvitation } from '../src/tenant-recovery-transaction.mjs';
import { assertRecoveryControlReadiness } from '../src/tenant-recovery-readiness.mjs';

test('MD-03.7: isolated PostgreSQL recovery approval, invitation, redemption, single use and immutable audit', async t => {
  const url=process.env.METADRIVE_TEST_DATABASE_URL;
  if(!url) return t.skip('Requires isolated CI PostgreSQL URL');
  // Never run this destructive fixture in production or against a tenant DB.
  if(process.env.CI!=='true')return t.skip('Disposable GitHub CI database only');
  const {Pool}=pg, unique=randomBytes(5).toString('hex');
  const name='md_recovery_ci_'+unique;
  const runtimeRole='md_recovery_ci_runtime_'+unique;
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
    // Readiness must reject the owner even though the schema and trigger exist.
    await assert.rejects(assertRecoveryControlReadiness(pool, {expectedDatabase:name}));
    // This disposable CI database is the only place where privileged migrations
    // and runtime role grants are exercised with real PostgreSQL.
    await pool.query('CREATE ROLE "'+runtimeRole+'" NOLOGIN NOINHERIT');
    await pool.query('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    await pool.query('GRANT CONNECT ON DATABASE "'+name+'" TO "'+runtimeRole+'"');
    await pool.query('GRANT USAGE ON SCHEMA public TO "'+runtimeRole+'"');
    for (const table of ['tenant_recovery_cases','tenant_recovery_invitations',
      'tenant_recovery_contacts','tenant_recovery_contact_proofs','tenant_recovery_repair_grants']) {
      await pool.query('GRANT SELECT,INSERT,UPDATE ON public.'+table+' TO "'+runtimeRole+'"');
    }
    for (const table of ['tenant_recovery_approvals','tenant_recovery_events','tenant_recovery_mfa_steps']) {
      await pool.query('GRANT SELECT,INSERT ON public.'+table+' TO "'+runtimeRole+'"');
    }
    await pool.query('GRANT USAGE ON SEQUENCE public.tenant_recovery_events_id_seq TO "'+runtimeRole+'"');
    const leastPrivilege = await pool.connect();
    try {
      await leastPrivilege.query('BEGIN');
      await leastPrivilege.query('SET LOCAL ROLE "'+runtimeRole+'"');
      assert.equal(await assertRecoveryControlReadiness(leastPrivilege,{expectedDatabase:name}),true);
      await assert.rejects(leastPrivilege.query('DELETE FROM public.tenant_recovery_events WHERE false'),
        'Runtime role must lack audit deletion privilege');
      // Permission errors abort a transaction, so leave this disposable
      // session and start a fresh one before any other check.
    } finally {
      await leastPrivilege.query('ROLLBACK');
      leastPrivilege.release();
    }

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
    await admin.query('DROP ROLE IF EXISTS "'+runtimeRole+'"').catch(()=>{});
    await admin.end();
  }
});
