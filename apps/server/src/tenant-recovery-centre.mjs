// Recovery is inert unless the isolated platform-control DB and private mail are configured.
// Platform operators cannot obtain invitation tokens, passwords or tenant sessions.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { openRecoveryCase } from './tenant-recovery-cases.mjs';
import { approveRecoveryCase, issueRecoveryInvitation, redeemRecoveryInvitation } from './tenant-recovery-transaction.mjs';

const DAY=86400000, PROOF_TTL=48*60*60*1000;
const identity=/^[a-zA-Z0-9_-]{1,128}$/;
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const sha=v=>createHash('sha256').update(v).digest('hex');
const newToken=()=>randomBytes(32).toString('base64url');
function validToken(token,hex) {
  return typeof token==='string' && token.length>=32 && token.length<=128
    && typeof hex==='string' && /^[0-9a-f]{64}$/.test(hex)
    && timingSafeEqual(Buffer.from(sha(token),'hex'),Buffer.from(hex,'hex'));
}
export function installTenantRecoveryCentre(app,options) {
  const {auth,tenantAdmin,platformAdmin,principal,tenantUser,domains,
    freshMfa,applyRestrictedRepair,isCurrentOperator,pool,deliver,verifyDomain}=options;
  const enabled=Boolean(pool&&deliver&&verifyDomain&&freshMfa&&applyRestrictedRepair);
  const generic={accepted:true};
  const limits=new Map();
  function throttle(req,res,next) {
    const key=req.ip||'unknown', now=Date.now();
    const recent=limits.get(key), slot=recent&&recent.until>now?recent:{until:now+3600000,count:0};
    slot.count++;limits.set(key,slot);
    if(slot.count>30)return res.status(429).json(generic);
    return next();
  }
  const route=handler=>async(req,res)=>{
    if(!enabled)return res.status(503).json({error:'Verified tenant recovery is not configured'});
    try {await handler(req,res);}
    catch {if(!res.headersSent)res.status(409).json({error:'Recovery request could not be verified'});}
  };
  async function transaction(task) {
    const db=await pool.connect();
    try {
      await db.query('BEGIN');const result=await task(db);await db.query('COMMIT');return result;
    } catch(error) {await db.query('ROLLBACK');throw error;}
    finally {db.release();}
  }
  function actor(res,req){return freshMfa(res,req.body?.mfaCode);}
  async function contactList(tenantId,mature=false) {
    const r=await pool.query('SELECT email,verified_at FROM tenant_recovery_contacts WHERE tenant_id=$1 AND verified_at IS NOT NULL ORDER BY email',[tenantId]);
    return r.rows.filter(x=>!mature||Date.now()-new Date(x.verified_at).getTime()>=7*DAY);
  }
  async function domainProof(tenantId) {
    for(const d of domains(tenantId).filter(d=>d.status==='VERIFIED')) {
      if(await verifyDomain(d).catch(()=>false))return true;
    }
    return false;
  }
  app.get('/api/tenant/recovery/contacts',auth,tenantAdmin,route(async(req,res)=>{
    const result=await pool.query('SELECT email,verified_at,enrolled_at FROM tenant_recovery_contacts WHERE tenant_id=$1 ORDER BY email',[principal(res).tenantId]);
    res.json({contacts:result.rows.map(x=>({email:x.email,verified:!!x.verified_at,enrolledAt:x.enrolled_at}))});
  }));
  app.post('/api/tenant/recovery/contacts',auth,tenantAdmin,route(async(req,res)=>{
    await actor(res,req);
    const tenantId=principal(res).tenantId,email=String(req.body?.email||'').trim().toLowerCase();
    if(!emailPattern.test(email)||email.length>254)return res.status(400).json({error:'Invalid contact address'});
    const count=await pool.query('SELECT count(*)::int AS n FROM tenant_recovery_contacts WHERE tenant_id=$1',[tenantId]);
    const active=await pool.query("SELECT id FROM tenant_recovery_cases WHERE tenant_id=$1 AND status IN ('pending','approved') LIMIT 1",[tenantId]);
    if(count.rows[0].n>=4||active.rowCount)return res.status(409).json({error:'Recovery contacts locked or limit reached'});
    const token=newToken();
    await transaction(async db=>{
      const existing=await db.query('SELECT verified_at FROM tenant_recovery_contacts WHERE tenant_id=$1 AND email=$2 FOR UPDATE',[tenantId,email]);
      if(existing.rows[0]?.verified_at)throw new Error('Already verified');
      await db.query('INSERT INTO tenant_recovery_contacts(tenant_id,email,challenge_digest,challenge_expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(tenant_id,email) DO UPDATE SET challenge_digest=EXCLUDED.challenge_digest,challenge_expires_at=EXCLUDED.challenge_expires_at',[tenantId,email,sha(token),new Date(Date.now()+PROOF_TTL)]);
      await deliver({to:email,subject:'Verify your MetaDrive emergency recovery contact',text:'A tenant administrator enrolled this contact. If expected, enter this 48-hour one-time verification token: '+token+'. If unexpected, ignore this email.'});
    });
    res.status(202).json(generic);
  }));
  app.post('/api/recovery/contacts/verify',throttle,route(async(req,res)=>{
    const {tenantId,email,token}=req.body||{};
    if(!identity.test(tenantId||'')||typeof email!=='string')return res.json(generic);
    await transaction(async db=>{
      const r=await db.query('SELECT challenge_digest,challenge_expires_at,verified_at FROM tenant_recovery_contacts WHERE tenant_id=$1 AND email=$2 FOR UPDATE',[tenantId,email.toLowerCase()]);
      const c=r.rows[0];
      if(c&&!c.verified_at&&new Date(c.challenge_expires_at).getTime()>Date.now()&&validToken(token,c.challenge_digest))
        await db.query('UPDATE tenant_recovery_contacts SET verified_at=now(),challenge_digest=NULL,challenge_expires_at=NULL WHERE tenant_id=$1 AND email=$2',[tenantId,email.toLowerCase()]);
    });
    res.json(generic);
  }));
  app.post('/api/platform/recovery/cases',auth,platformAdmin,route(async(req,res)=>{
    const requester=await actor(res,req),{tenantId,claimantUserId}=req.body||{};
    if(!identity.test(tenantId||'')||!tenantUser(tenantId,claimantUserId)||tenantUser(tenantId,claimantUserId).disabled)
      return res.status(400).json({error:'Valid active tenant claimant required'});
    const contacts=await contactList(tenantId,true);
    if(contacts.length<2||!(await domainProof(tenantId)))
      return res.status(409).json({error:'Two verified, mature contacts and current DNS proof required'});
    const created=await openRecoveryCase(pool,{tenantId,claimantUserId,requester:{...requester,role:'recovery_intake',trustedMfa:true}});
    try {
    for(const c of contacts) {
      const token=newToken();
      await transaction(async db=>{
        await db.query('INSERT INTO tenant_recovery_contact_proofs(case_id,contact_email,challenge_digest,expires_at) VALUES($1,$2,$3,$4)',[created.caseId,c.email,sha(token),new Date(Date.now()+PROOF_TTL)]);
        await deliver({to:c.email,subject:'MetaDrive tenant emergency recovery request',text:'Recovery case '+created.caseId+' for tenant '+tenantId+' and claimant user '+claimantUserId+'. Confirm or dispute with this 48-hour one-time contact token: '+token+'. Check the request with your organisation independently. Do not provide it to support staff.'});
      });
    }
    await pool.query('UPDATE tenant_recovery_cases SET notification_dispatch_complete=true WHERE id=$1 AND status=\'pending\'',[created.caseId]);
    const verified=await pool.query(
      'SELECT count(*)::int AS n FROM tenant_recovery_contact_proofs WHERE case_id=$1 AND verified_at IS NOT NULL',
      [created.caseId]);
    if(verified.rows[0].n>=2)
      await pool.query(
        "UPDATE tenant_recovery_cases SET identity_proof_status='verified',out_of_band_verified=true,contacts_notified=true WHERE id=$1 AND status='pending'",
        [created.caseId]);
    } catch (error) {
      // A half-notified recovery must never be approvable or strand an active
      // claimant: reject it and permit a fresh, independently notified case.
      await pool.query("UPDATE tenant_recovery_cases SET status='rejected',updated_at=now() WHERE id=$1 AND status='pending'",[created.caseId]);
      throw error;
    }
    res.status(201).json({caseId:created.caseId,status:'pending',cooldownHours:24});
  }));
  async function prove(req,dispute) {
    const {email,token}=req.body||{},caseId=req.params.caseId;
    if(!/^[0-9a-f-]{36}$/i.test(caseId)||typeof email!=='string')return false;
    return transaction(async db=>{
      const c=(await db.query('SELECT * FROM tenant_recovery_contact_proofs WHERE case_id=$1 AND contact_email=$2 FOR UPDATE',[caseId,email.toLowerCase()])).rows[0];
      const record=(await db.query('SELECT * FROM tenant_recovery_cases WHERE id=$1 FOR UPDATE',[caseId])).rows[0];
      if(!c||!record||record.status!=='pending'||record.disputed||new Date(c.expires_at).getTime()<=Date.now()||!validToken(token,c.challenge_digest))return false;
      if(dispute) {
        await db.query("UPDATE tenant_recovery_cases SET status='disputed',disputed=true,updated_at=now() WHERE id=$1",[caseId]);
        await db.query('UPDATE tenant_recovery_invitations SET used_at=now() WHERE case_id=$1 AND used_at IS NULL',[caseId]);
        await db.query("INSERT INTO tenant_recovery_events(case_id,actor_id,event_type) VALUES($1,$2,'case_disputed')",[caseId,email.toLowerCase()]);
      } else if(!c.verified_at) {
        await db.query('UPDATE tenant_recovery_contact_proofs SET verified_at=now() WHERE case_id=$1 AND contact_email=$2',[caseId,email.toLowerCase()]);
        const count=await db.query('SELECT count(*)::int AS n FROM tenant_recovery_contact_proofs WHERE case_id=$1 AND verified_at IS NOT NULL',[caseId]);
        if(count.rows[0].n>=2 && record.notification_dispatch_complete === true) {
          await db.query("UPDATE tenant_recovery_cases SET identity_proof_status='verified',out_of_band_verified=true,contacts_notified=true,updated_at=now() WHERE id=$1 AND status='pending'",[caseId]);
          await db.query("INSERT INTO tenant_recovery_events(case_id,actor_id,event_type) VALUES($1,$2,'independent_contacts_verified')",[caseId,'recovery-service']);
        }
      }
      return true;
    });
  }
  app.post('/api/recovery/cases/:caseId/confirm',throttle,route(async(req,res)=>{await prove(req,false);res.json(generic);}));
  app.post('/api/recovery/cases/:caseId/dispute',throttle,route(async(req,res)=>{await prove(req,true);res.json(generic);}));
  app.get('/api/platform/recovery/cases/:caseId',auth,platformAdmin,route(async(req,res)=>{
    const c=await pool.query('SELECT id,tenant_id,claimant_user_id,status,identity_proof_status,contacts_notified,disputed,created_at FROM tenant_recovery_cases WHERE id=$1',[req.params.caseId]);
    if(!c.rowCount)return res.status(404).json({error:'Case not found'});
    const approvals=await pool.query('SELECT count(*)::int AS n FROM tenant_recovery_approvals WHERE case_id=$1',[req.params.caseId]);
    res.json({case:c.rows[0],approvals:approvals.rows[0].n});
  }));
  app.post('/api/platform/recovery/cases/:caseId/approve',auth,platformAdmin,route(async(req,res)=>{
    const a=await actor(res,req);
    await approveRecoveryCase(pool,{caseId:req.params.caseId,operator:{...a,role:'recovery_operator',trustedMfa:true}});
    res.json({approved:true});
  }));
  app.post('/api/platform/recovery/cases/:caseId/invite',auth,platformAdmin,route(async(req,res)=>{
    const a=await actor(res,req),c=await pool.query('SELECT tenant_id FROM tenant_recovery_cases WHERE id=$1',[req.params.caseId]);
    if(!c.rowCount||!(await domainProof(c.rows[0].tenant_id)))return res.status(409).json({error:'Current domain ownership proof required'});
    const proof=await pool.query('SELECT contact_email FROM tenant_recovery_contact_proofs WHERE case_id=$1 AND verified_at IS NOT NULL ORDER BY contact_email',[req.params.caseId]);
    if(proof.rowCount<2)return res.status(409).json({error:'Independent contact confirmations missing'});
    const operators=await pool.query(
      'SELECT operator_id FROM tenant_recovery_approvals WHERE case_id=$1 AND mfa_verified=true AND operator_active=true',
      [req.params.caseId]);
    const current=new Set(operators.rows.filter(item=>isCurrentOperator?.(item.operator_id)).map(item=>item.operator_id));
    if(current.size<2)return res.status(409).json({error:'Two currently authorised recovery operators required'});
    const receipt=await issueRecoveryInvitation(pool,{caseId:req.params.caseId,operator:{...a,role:'recovery_operator',trustedMfa:true},
      deliverToVerifiedContact:async invitation=>deliver({to:proof.rows[0].contact_email,subject:'MetaDrive verified emergency recovery invitation',
        text:'The following 15-minute single-use token is only for the independently verified tenant claimant. Case: '+invitation.caseId+'. Token: '+invitation.token})});
    res.json(receipt);
  }));
  app.post('/api/tenant/recovery/cases/:caseId/redeem',auth,route(async(req,res)=>{
    const p=principal(res);await actor(res,req);
    const receipt=await redeemRecoveryInvitation(pool,{caseId:req.params.caseId,tenantId:p.tenantId,
      claimant:{id:p.userId,active:true,trustedMfa:true},token:req.body?.invitationToken});
    res.json({caseId:receipt.caseId,accepted:true,repairRequired:true});
  }));
  app.post('/api/tenant/recovery/cases/:caseId/repair',auth,route(async(req,res)=>{
    const p=principal(res);await actor(res,req);
    await transaction(async db=>{
      const grant=(await db.query('SELECT * FROM tenant_recovery_repair_grants WHERE case_id=$1 FOR UPDATE',[req.params.caseId])).rows[0];
      if(!grant||grant.consumed_at||grant.tenant_id!==p.tenantId||grant.claimant_user_id!==p.userId||
        Date.now()-new Date(grant.issued_at).getTime()>3600000)throw new Error('Restricted repair grant not valid');
      await applyRestrictedRepair({tenantId:grant.tenant_id,userId:grant.claimant_user_id,caseId:req.params.caseId});
      await db.query('UPDATE tenant_recovery_repair_grants SET consumed_at=now() WHERE case_id=$1 AND consumed_at IS NULL',[req.params.caseId]);
    });
    res.json({repaired:true,signInRequired:true});
  }));
}
