import { useEffect, useState, type FormEvent } from 'react';
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Contact = { email: string; verified: boolean; enrolledAt: string };
export default function TenantRecoveryPanel({ request, operator, permitted, tenantId = '' }: {
  request: Request; operator: boolean; permitted: boolean; tenantId?: string;
}) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [email, setEmail] = useState('');
  const [contactToken, setContactToken] = useState('');
  const [step, setStep] = useState('');
  const [claimantId, setClaimantId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [invitation, setInvitation] = useState('');
  const [caseStatus, setCaseStatus] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(true);
  useEffect(() => {
    if (operator || !permitted) return;
    let cancelled = false;
    request<{ contacts: Contact[] }>('/tenant/recovery/contacts')
      .then(data => { if (!cancelled) { setContacts(data.contacts); setConfigured(true); } })
      .catch(() => { if (!cancelled) setConfigured(false); });
    return () => { cancelled = true; };
  }, [request, operator, permitted]);
  async function execute(path: string, body: Record<string, unknown>, message: string) {
    if (busy) return;
    setBusy(true); setStatus('');
    try {
      const result = await request<Record<string, unknown>>(path, {
        method: 'POST', body: JSON.stringify(body)
      });
      if (typeof result.caseId === 'string') setCaseId(result.caseId);
      setStatus(message);
      setStep(''); setContactToken(''); setInvitation('');
      if (!operator && permitted) {
        const list = await request<{ contacts: Contact[] }>('/tenant/recovery/contacts').catch(() => null);
        if (list) setContacts(list.contacts);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Recovery action failed');
    } finally { setBusy(false); }
  }
  const submit = (event: FormEvent, path: string, body: Record<string, unknown>, message: string) => {
    event.preventDefault();
    void execute(path, body, message);
  };
  if (operator && !permitted) return null;
  return <section className="surface permission-section tenant-recovery-panel" aria-label="Tenant Recovery Centre">
    <h2>Tenant Emergency Recovery</h2>
    <p className="permission-help">
      Recovery requires two mature verified contacts, DNS ownership, a 24-hour cooling-off period,
      two independent platform operators with fresh MFA, and claimant MFA. Support staff never receive tenant passwords or login sessions.
    </p>
    {!configured && !operator && <p role="status">Recovery services are not yet configured. Enrollment is unavailable.</p>}
    {status && <p role="status">{status}</p>}
    <label className="form-label">Fresh authenticator code (required for protected actions)
      <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}"
        value={step} onChange={e => setStep(e.target.value)} placeholder="6-digit MFA code" />
    </label>
    {operator ? <>
      <form onSubmit={e => submit(e, '/platform/recovery/cases',
        { tenantId, claimantUserId: claimantId, mfaCode: step },
        'Case opened. Contact verifications and mandatory waiting period must finish before approval.')}>
        <h3>Open a verified recovery case</h3>
        <p className="permission-help">Tenant: {tenantId}. Obtain the claimant user ID through the independently verified recovery process.</p>
        <label className="form-label">Claimant user ID
          <input required value={claimantId} onChange={e => setClaimantId(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-brand" disabled={busy || step.length !== 6 || !claimantId}>Open case</button>
      </form>
      <form onSubmit={e => {
        e.preventDefault(); setBusy(true);
        request<{case: {status:string;identity_proof_status:string};approvals:number}>('/platform/recovery/cases/' + encodeURIComponent(caseId))
          .then(data=>setCaseStatus('Case '+data.case.status+', identity '+data.case.identity_proof_status+', approvals '+data.approvals))
          .catch(err=>setCaseStatus(err instanceof Error?err.message:'Unable to look up case'))
          .finally(()=>setBusy(false));
      }}>
        <h3>Review and approve</h3>
        <label className="form-label">Case ID
          <input required value={caseId} onChange={e => setCaseId(e.target.value)} />
        </label>
        <button type="submit" className="btn" disabled={busy || !caseId}>Check case</button>
        {caseStatus && <p role="status">{caseStatus}</p>}
      </form>
      <div className="tenant-actions">
        <button type="button" className="btn" disabled={busy || step.length!==6 || !caseId}
          onClick={()=>void execute('/platform/recovery/cases/'+encodeURIComponent(caseId)+'/approve',{mfaCode:step},
            'Your MFA-backed approval was recorded. A second independent operator is required.')}>Approve case</button>
        <button type="button" className="btn" disabled={busy || step.length!==6 || !caseId}
          onClick={()=>void execute('/platform/recovery/cases/'+encodeURIComponent(caseId)+'/invite',{mfaCode:step},
            'Invitation delivered to a verified contact, not to the platform operator.')}>Send invitation</button>
      </div>
    </> : <>
      {permitted && <>
        <h3>Pre-enrolled recovery contacts</h3>
        <p className="permission-help">Enroll at least two independent contacts and verify their emails at least seven days before any emergency.</p>
        <ul>{contacts.map(c=><li key={c.email}>{c.email} — {c.verified ? 'Verified' : 'Awaiting verification'}</li>)}</ul>
        <form onSubmit={e=>submit(e,'/tenant/recovery/contacts',{email,mfaCode:step},'Verification instructions sent privately to the contact.')}>
          <label className="form-label">Independent recovery contact email
            <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} />
          </label>
          <button className="btn btn-brand" disabled={busy||step.length!==6} type="submit">Enroll contact</button>
        </form>
      </>}
      <form onSubmit={e=>submit(e,'/recovery/contacts/verify',
        {tenantId:claimantId,email,token:contactToken},'Contact verification submitted.')}>
        <h3>Verify a recovery contact</h3>
        <p className="permission-help">Enter the tenant ID, contact email and private email verification token.</p>
        <label className="form-label">Tenant ID
          <input required value={claimantId} onChange={e=>setClaimantId(e.target.value)} placeholder="Tenant ID" />
        </label>
        <label className="form-label">Contact email
          <input type="email" required value={email} onChange={e=>setEmail(e.target.value)} />
        </label>
        <label className="form-label">Verification token
          <input required value={contactToken} onChange={e=>setContactToken(e.target.value)} autoComplete="off" />
        </label>
        <button className="btn" type="submit" disabled={busy||!contactToken}>Verify contact</button>
      </form>
      <h3>Respond to an emergency case</h3>
      <p className="permission-help">A pre-enrolled contact independently receives a case token. They can verify or dispute the case without giving support staff their token.</p>
      <label className="form-label">Case ID
        <input value={caseId} onChange={e=>setCaseId(e.target.value)} />
      </label>
      <label className="form-label">Private case contact token
        <input type="password" autoComplete="off" value={contactToken} onChange={e=>setContactToken(e.target.value)} />
      </label>
      <div className="tenant-actions">
        <button type="button" className="btn" disabled={busy||!caseId||!email||!contactToken}
          onClick={()=>void execute('/recovery/cases/'+encodeURIComponent(caseId)+'/confirm',
            {email,token:contactToken},'Case verification submitted.')}>Confirm this case</button>
        <button type="button" className="btn" disabled={busy||!caseId||!email||!contactToken}
          onClick={()=>void execute('/recovery/cases/'+encodeURIComponent(caseId)+'/dispute',
            {email,token:contactToken},'Case dispute submitted; a valid contact proof blocks recovery.')}>Dispute this case</button>
      </div>
      <h3>Recover administrator access</h3>
      <p className="permission-help">A verified contact must separately confirm the recovery case and pass the invitation to the claimant. The claimant signs in with their own credentials and MFA; no support operator can sign in for them.</p>
      <label className="form-label">Recovery case ID
        <input value={caseId} onChange={e=>setCaseId(e.target.value)} />
      </label>
      <label className="form-label">Private 15-minute invitation token
        <input type="password" autoComplete="off" value={invitation} onChange={e=>setInvitation(e.target.value)} />
      </label>
      <div className="tenant-actions">
        <button type="button" className="btn btn-brand" disabled={busy||step.length!==6||!caseId||!invitation}
          onClick={()=>void execute('/tenant/recovery/cases/'+encodeURIComponent(caseId)+'/redeem',
            {invitationToken:invitation,mfaCode:step},'Invitation accepted. Perform the restricted repair with a new MFA code.')}>Redeem invitation</button>
        <button type="button" className="btn" disabled={busy||step.length!==6||!caseId}
          onClick={()=>void execute('/tenant/recovery/cases/'+encodeURIComponent(caseId)+'/repair',
            {mfaCode:step},'Administrator access restored. Sign out and sign back in.')}>Complete repair</button>
      </div>
    </>}
  </section>;
}
