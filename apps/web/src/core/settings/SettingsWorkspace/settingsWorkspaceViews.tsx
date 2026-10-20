import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Save, Trash2, Plus, Lock, Unlock } from 'lucide-react';
import SettingsViewRow from '../SettingsViewRow/SettingsViewRow';
import TenantPasswordPolicy from './TenantPasswordPolicy';
import TenantMfaControls from './TenantMfaControls';
import TenantSessionControls from './TenantSessionControls';
import TenantFederationControls from './TenantFederationControls';
import {PlatformPageSlot} from '../../platform/Workspace/PlatformPageSlot';
import type { CurrencySettingsMetadata } from '../../metadata/Definitions/metadata';

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
type PageHeadingProps = { eyebrow?: string; title: string; description?: string; actions?: ReactNode };
export function createSettingsViews(apiRequest: ApiRequest, PageHeading: (props: PageHeadingProps) => ReactNode) {
type AutomationSettingsDraft = {
  autoRetryFailedFlows: boolean;
  maxRetryAttempts: number;
  conversationIdleMinutes: number;
  flowServiceUserId: string | null;
};

function AutomationSettingsWorkspace({ canManage }: { canManage: boolean }) {
  const [draft, setDraft] = useState<AutomationSettingsDraft>({
    autoRetryFailedFlows: false, maxRetryAttempts: 10, conversationIdleMinutes: 15,
    flowServiceUserId: null
  });
  const [serviceUsers,setServiceUsers]=useState<Array<{id:string;name:string;email:string;enabled:boolean}>>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const beforeEdit = useRef<AutomationSettingsDraft | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    const settings=apiRequest<AutomationSettingsDraft>('/metadata/automation-settings');
    const users=canManage
      ?apiRequest<{users:Array<{id:string;name:string;email:string;enabled:boolean}>}>('/metadata/automation-service-users')
      :Promise.resolve({users:[]});
    void Promise.all([settings,users])
      .then(([result,userResult]) => { if (active) { setDraft(result); setServiceUsers(userResult.users); setLoaded(true); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canManage]);

  const startEdit = (field: string) => {
    if (!canManage || editingRow || loading) return;
    beforeEdit.current = { ...draft };
    setEditingRow(field);
    setNotice('');
    setError('');
  };
  const cancelEdit = () => {
    if (saving) return;
    if (beforeEdit.current) setDraft(beforeEdit.current);
    beforeEdit.current = null;
    setEditingRow(null);
    setError('');
  };
  const save = async () => {
    if (!canManage || !editingRow || saving) return;
    setError('');
    setNotice('');
    setSaving(true);
    try {
      const result = await apiRequest<AutomationSettingsDraft>('/metadata/automation-settings', {
        method: 'PUT', body: JSON.stringify(draft)
      });
      setDraft(result);
      setEditingRow(null);
      beforeEdit.current = null;
      setNotice('Process automation settings saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  };

  const editable = (key: string) => canManage && !editingRow && !loading;
  const serviceUser=serviceUsers.find(user=>user.id===draft.flowServiceUserId);
  return <div className="connector-settings-page settings-read-first-page">
    <PageHeading eyebrow="Setup / Automation" title="Process Automation Settings"
      description="Review automation execution policies and the explicitly selected identity used for scheduled Flow triggers." />
    <section className="surface permission-section" style={{ maxWidth: 800 }}>
      {loading ? <p>Loading process automation settings…</p> : loaded ? <>
        <h2>Execution safety</h2>
        <div className="settings-read-first-section">
          {editingRow==='flowServiceUserId'
            ?<div className="settings-edit-row">
              <PlatformPageSlot slotKey="field-settings-04"><label className="form-label">Scheduled Flow service user
                <select className="form-control" value={draft.flowServiceUserId??''} onChange={event=>
                  setDraft(current=>({...current,flowServiceUserId:event.target.value||null}))}>
                  <option value="">Not configured (scheduled triggers remain disabled)</option>
                  {serviceUsers.map(user=><option key={user.id} value={user.id}>
                    {user.name} ({user.email}){user.enabled?'':' — disabled'}
                  </option>)}
                </select>
              </label></PlatformPageSlot>
            </div>
            :<SettingsViewRow label="Scheduled Flow service user"
              value={serviceUser?`${serviceUser.name} (${serviceUser.email})`
                :draft.flowServiceUserId??'Not configured'}
              canEdit={editable('flowServiceUserId')} onEdit={()=>startEdit('flowServiceUserId')} />}
          <p className="permission-help">No user is implicitly elevated. Tenant, Flow activation, app entitlement, and current OneEngine grants must still pass on every execution.</p>
          {editingRow === 'autoRetryFailedFlows'
            ? <div className="settings-edit-row">
                <PlatformPageSlot slotKey="field-settings-01"><label className="checkbox-row">
                  <input type="checkbox" checked={draft.autoRetryFailedFlows}
                    onChange={(event) => setDraft((current) => ({ ...current, autoRetryFailedFlows: event.target.checked }))} />
                  Automatically retry failed flow executions
                </label></PlatformPageSlot>
              </div>
            : <SettingsViewRow label="Automatically retry failed flow executions"
                value={draft.autoRetryFailedFlows ? 'On' : 'Off'}
                canEdit={editable('autoRetryFailedFlows')} onEdit={() => startEdit('autoRetryFailedFlows')} />}
          <p className="permission-help">Off by default. Disabled retries are logged; new scheduled occurrences can still run.</p>
          {editingRow === 'maxRetryAttempts'
            ? <div className="settings-edit-row">
                <PlatformPageSlot slotKey="field-settings-02"><label className="form-label">Maximum failed attempts
                  <input className="form-control" type="number" min="1" max="20" step="1"
                    value={draft.maxRetryAttempts} onChange={(event) =>
                      setDraft((current) => ({ ...current, maxRetryAttempts: Number(event.target.value) }))} />
                </label></PlatformPageSlot>
              </div>
            : <SettingsViewRow label="Maximum failed attempts" value={String(draft.maxRetryAttempts)}
                canEdit={editable('maxRetryAttempts')} onEdit={() => startEdit('maxRetryAttempts')} />}
          <p className="permission-help">Default: 10. Exhausted deliveries are recorded as failed or dead-lettered.</p>
        </div>
        <h2>Conversation inactivity</h2>
        <div className="settings-read-first-section">
          {editingRow === 'conversationIdleMinutes'
            ? <div className="settings-edit-row">
                <PlatformPageSlot slotKey="field-settings-03"><label className="form-label">Expire inactive conversations after (minutes)
                  <input className="form-control" type="number" min="1" max="1440" step="1"
                    value={draft.conversationIdleMinutes} onChange={(event) =>
                      setDraft((current) => ({ ...current, conversationIdleMinutes: Number(event.target.value) }))} />
                </label></PlatformPageSlot>
              </div>
            : <SettingsViewRow label="Conversation idle timeout"
                value={`${draft.conversationIdleMinutes} minutes`}
                canEdit={editable('conversationIdleMinutes')} onEdit={() => startEdit('conversationIdleMinutes')} />}
          <p className="permission-help">Default: 15 minutes. Existing message records are retained after inactivity.</p>
        </div>
        {editingRow && canManage && <div className="settings-read-first-toolbar">
          <button className="btn" type="button" disabled={saving} onClick={cancelEdit}>Cancel</button>
          <button className="btn btn-brand" type="button" onClick={() => void save()}
            disabled={saving || !Number.isInteger(draft.maxRetryAttempts) || draft.maxRetryAttempts < 1 || draft.maxRetryAttempts > 20
              || !Number.isInteger(draft.conversationIdleMinutes) || draft.conversationIdleMinutes < 1 || draft.conversationIdleMinutes > 1440}>
            <Save size={14} />{saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>}
      </> : null}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </section>
  </div>;
}

type TenantMfaMode = 'Off' | 'Optional' | 'Required';

function TenantEmailRecoverySettings({ canManage }: { canManage: boolean }) {
  const [smtpCredentialId, setSmtpCredentialId] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [method, setMethod] = useState<'OTP' | 'LINK'>('OTP');
  const [subject, setSubject] = useState('{!Tenant.Name} — password recovery');
  const [body, setBody] = useState('Your verification code is {!Verification.Value}. Expires in {!Verification.ExpiryMinutes} minutes.');
  const [ready, setReady] = useState(false);
  const [credentials, setCredentials] = useState<Array<{ id: string; label: string; protocol: string; enabled: boolean }>>([]);
  const [permitted, setPermitted] = useState(false);
  const [editing, setEditing] = useState(false);
  const original = useRef<{ smtpCredentialId: string; fromEmail: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void apiRequest<{ smtpCredentialId: string; fromEmail: string; linkReady: boolean; policy?: { method: 'OTP'|'LINK'; templates?: {email?:{subject:string;body:string}} } }>('/auth/password-recovery/settings')
      .then((value) => {
        if (!active) return;
        setPermitted(true); setSmtpCredentialId(value.smtpCredentialId);
        setFromEmail(value.fromEmail); setReady(value.linkReady);
        setMethod(value.policy?.method ?? 'OTP');
        setSubject(value.policy?.templates?.email?.subject ?? '{!Tenant.Name} — password recovery');
        setBody(value.policy?.templates?.email?.body ?? 'Your verification code is {!Verification.Value}. Expires in {!Verification.ExpiryMinutes} minutes.');
      }).catch(() => { if (active) setPermitted(false); });
    void apiRequest<{ credentials: Array<{ id: string; label: string; protocol: string; enabled: boolean }> }>('/named-credentials')
      .then((response) => { if (active) setCredentials(response.credentials.filter((item) => item.protocol === 'SMTP' && item.enabled)); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  if (!permitted) return null;
  const beginEdit = () => {
    if (!canManage || busy) return;
    original.current = { smtpCredentialId, fromEmail };
    setEditing(true);
    setMessage('');
  };
  const cancelEdit = () => {
    if (busy) return;
    if (original.current) {
      setSmtpCredentialId(original.current.smtpCredentialId);
      setFromEmail(original.current.fromEmail);
    }
    original.current = null;
    setEditing(false);
    setMessage('');
  };
  const save = async () => {
    if (!canManage || !editing || busy) return;
    setBusy(true); setMessage('');
    try {
      await apiRequest('/auth/password-recovery/settings', {
        method: 'PUT', body: JSON.stringify({ smtpCredentialId, fromEmail: smtpCredentialId ? fromEmail : '',
          policy: { method, defaultChannel:'email', allowedChannels:['email'], templates: { email: { subject, body } } } })
      });
      original.current = null;
      setEditing(false);
      setMessage('Password recovery configuration saved.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to save recovery settings'); }
    finally { setBusy(false); }
  };
  return <section className="surface permission-section">
    <TenantPasswordPolicy request={apiRequest} canManage={canManage} />
    <h2>Tenant password recovery</h2>
    <p>Choose OTP or reset-link delivery, with editable templates and tenant-scoped SMTP. MFA is never bypassed.</p>
    {!ready && <p role="alert" className="permission-help">
      Configure a trusted HTTPS password-reset origin on the server before enabling recovery.
    </p>}
    <div className="settings-read-first-section">
      {editing ? <div className="settings-edit-row">
        <PlatformPageSlot slotKey="field-settings-04"><label className="form-label" htmlFor="recovery-smtp">SMTP Named Credential
          <select className="form-control" id="recovery-smtp" value={smtpCredentialId}
            onChange={(event) => setSmtpCredentialId(event.target.value)}>
            <option value="">Disabled</option>
            {credentials.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}
          </select>
        </label></PlatformPageSlot>
        <PlatformPageSlot slotKey="field-settings-05"><label className="form-label" htmlFor="recovery-method">Verification method
          <select className="form-control" id="recovery-method" value={method} onChange={(event)=>setMethod(event.target.value as 'OTP'|'LINK')}>
            <option value="OTP">6-digit email OTP</option><option value="LINK">Email reset link</option>
          </select>
        </label></PlatformPageSlot>
        <PlatformPageSlot slotKey="field-settings-06"><label className="form-label" htmlFor="recovery-subject">Email subject template
          <input className="form-control" id="recovery-subject" value={subject} onChange={(event)=>setSubject(event.target.value)} />
        </label></PlatformPageSlot>
        <PlatformPageSlot slotKey="field-settings-07"><label className="form-label" htmlFor="recovery-body">Email body template
          <textarea className="form-control" id="recovery-body" rows={5} value={body} onChange={(event)=>setBody(event.target.value)} />
        </label></PlatformPageSlot>
        <PlatformPageSlot slotKey="field-settings-08"><label className="form-label" htmlFor="recovery-sender">Sender email
          <input className="form-control" id="recovery-sender" type="email" value={fromEmail}
            onChange={(event) => setFromEmail(event.target.value)} disabled={!smtpCredentialId} />
        </label></PlatformPageSlot>
      </div> : <>
        <SettingsViewRow label="SMTP Named Credential"
          value={credentials.find((item) => item.id === smtpCredentialId)?.label ?? (smtpCredentialId ? 'Configured' : 'Disabled')}
          canEdit={canManage} onEdit={beginEdit} />
        <SettingsViewRow label="Verification method" value={method} canEdit={canManage} onEdit={beginEdit} />
        <SettingsViewRow label="Email template" value={subject} canEdit={canManage} onEdit={beginEdit} />
        <SettingsViewRow label="Sender email" value={smtpCredentialId ? fromEmail : 'Platform fallback (if configured)'}
          canEdit={canManage} onEdit={beginEdit} />
      </>}
    </div>
    {editing && canManage && <div className="settings-read-first-toolbar">
      <button type="button" className="btn" disabled={busy} onClick={cancelEdit}>Cancel</button>
      <button type="button" className="btn btn-brand" onClick={() => void save()}
        disabled={busy || (Boolean(smtpCredentialId) && (!ready || !fromEmail))}>
        <Save size={14} />{busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>}
    {message && <p role="status" className="settings-view-row-help">{message}</p>}
  </section>;
}

function TenantUserLockSettings() {
  return null;
}

function AccountSessionSecurity({ onReauthenticate }: { onReauthenticate: () => void }) {
  const [sessions, setSessions] = useState<Array<{ familyId: string; expiresAt: number; mfaVerified: boolean }>>([]);
  const [password, setPassword] = useState('');
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void apiRequest<{ sessions: Array<{ familyId: string; expiresAt: number; mfaVerified: boolean }> }>('/auth/sessions')
      .then((response) => { if (active) setSessions(response.sessions); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { active = false; };
  }, []);
  const revokeAll = async () => {
    setBusy(true); setError('');
    try {
      await apiRequest('/auth/sessions/revoke-all', {
        method: 'POST', body: JSON.stringify({ currentPassword: password })
      });
      setPassword(''); setConfirmingRevoke(false);
      onReauthenticate();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to revoke sessions');
    } finally { setBusy(false); }
  };
  return <section className="surface permission-section">
    <h2>Active sessions</h2>
    <p>Active refresh sessions for your account. Revoking all sessions immediately invalidates existing access tokens on every device.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <p>{sessions.length} active {sessions.length === 1 ? 'session' : 'sessions'}</p>
    {sessions.length > 0 && <ul>{sessions.slice(0, 10).map((session) =>
      <li key={session.familyId}>Expires {new Date(session.expiresAt * 1000).toLocaleString()}
        {session.mfaVerified ? ' · MFA verified' : ''}</li>
    )}</ul>}
    {!confirmingRevoke && <button type="button" className="btn"
      onClick={() => setConfirmingRevoke(true)}>Sign out on all devices</button>}
    {confirmingRevoke && <div className="settings-edit-row">
      <PlatformPageSlot slotKey="field-settings-09"><label className="form-label" htmlFor="sessions-revoke-password">Confirm current password
        <input className="form-control" id="sessions-revoke-password" type="password"
          autoComplete="current-password" value={password}
          onChange={(event) => setPassword(event.target.value)} />
      </label></PlatformPageSlot>
      <div className="settings-read-first-toolbar">
        <button type="button" className="btn" disabled={busy}
          onClick={() => { setPassword(''); setConfirmingRevoke(false); }}>Cancel</button>
        <button type="button" className="btn btn-brand" disabled={busy || !password}
          onClick={() => void revokeAll()}>{busy ? 'Revoking…' : 'Confirm sign out on all devices'}</button>
      </div>
    </div>}
  </section>;
}

function TenantSecurityAudit() {
  const [events, setEvents] = useState<Array<{ id: string; at: string; actorUserId: string | null; action: string; loginIdentifier?: string; sourceIp?: string; details?: Record<string, string> }>>([]);
  const [permitted, setPermitted] = useState(false);
  useEffect(() => {
    let active = true;
    void apiRequest<{ events: Array<{ id: string; at: string; actorUserId: string | null; action: string; loginIdentifier?: string; sourceIp?: string; details?: Record<string, string> }> }>('/auth/security-events?limit=50')
      .then((response) => { if (active) { setEvents(response.events); setPermitted(true); } })
      .catch(() => { if (active) setPermitted(false); });
    return () => { active = false; };
  }, []);
  if (!permitted) return null;
  return <section className="surface permission-section">
    <h2>Login history and security activity</h2>
    <p>Recent tenant security events. Only authorized security administrators can view this history.</p>
    {!events.length ? <p>No security activity recorded.</p> :
      <ul>{events.map((event) => <li key={event.id}>
        <strong>{event.action}</strong> · {new Date(event.at).toLocaleString()}
        {event.loginIdentifier ? ` · ${event.loginIdentifier}` : ''}
        {event.sourceIp ? ` · ${event.sourceIp}` : ''}
        {event.details?.from && event.details?.to ? ' · ' + event.details.from + ' → ' + event.details.to : ''}
      </li>)}</ul>}
  </section>;
}

function TenantMfaSettings({ onReauthenticate, canManage }: { onReauthenticate: () => void; canManage: boolean }) {
  return <><TenantMfaControls request={apiRequest} canManage={canManage} onReauthenticate={onReauthenticate}/>
    <TenantSessionControls request={apiRequest} canManage={canManage}/>
    <TenantFederationControls request={apiRequest} canManage={canManage}/></>;
}

type CompanyProfile = {logoUrl?:string;legalName:string;tradingName:string;website:string;phone:string;email:string;addressLine1:string;addressLine2:string;city:string;postcode:string;country:string;timezone:string;locale:string;description:string};
const blankCompanyProfile:CompanyProfile={logoUrl:'',legalName:'',tradingName:'',website:'',phone:'',email:'',addressLine1:'',addressLine2:'',city:'',postcode:'',country:'',timezone:'Europe/London',locale:'en-GB',description:''};
const companyFields:ReadonlyArray<{key:keyof CompanyProfile;label:string}>= [
{key:'legalName',label:'Legal company name'},{key:'tradingName',label:'Trading name'},
{key:'description',label:'Description'},{key:'website',label:'Website'},
{key:'email',label:'Contact email'},{key:'phone',label:'Contact phone'},
{key:'addressLine1',label:'Address line 1'},{key:'addressLine2',label:'Address line 2'},
{key:'city',label:'Town / City'},{key:'postcode',label:'Postcode'},
{key:'country',label:'Country'},{key:'timezone',label:'Time zone'},{key:'locale',label:'Locale'}];

function CompanySettings({ canManage }: { canManage: boolean }) {
  const [company,setCompany]=useState<CompanyProfile>(blankCompanyProfile);
  const [companyBeforeEdit,setCompanyBeforeEdit]=useState<CompanyProfile|null>(null);
  const [companyEditing,setCompanyEditing]=useState(false);
  const [companyLoading,setCompanyLoading]=useState(true);
  const [companySaving,setCompanySaving]=useState(false);
  const [companyError,setCompanyError]=useState('');
  const [companyNotice,setCompanyNotice]=useState('');
  const [logoReading,setLogoReading]=useState(false);
  const selectCompanyLogo=async(file?:File)=>{
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setCompanyError('Choose a PNG, JPG or WebP image.');return;}
    if(file.size>128*1024){setCompanyError('Logo must be 128 KB or smaller.');return;}
    setLogoReading(true);setCompanyError('');
    try{
      const encoded=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Unable to read selected logo'));reader.readAsDataURL(file)});
      setCompany(previous=>({...previous,logoUrl:encoded}));
    }catch(error){setCompanyError(error instanceof Error?error.message:String(error));}
    finally{setLogoReading(false)}
  };
  useEffect(()=>{let active=true;void apiRequest<{profile:CompanyProfile|null}>('/tenant/company-profile')
   .then(value=>{if(active)setCompany({...blankCompanyProfile,...(value.profile??{})});})
   .catch(error=>{if(active)setCompanyError(error instanceof Error?error.message:String(error));})
   .finally(()=>{if(active)setCompanyLoading(false)});return()=>{active=false}},[]);
  const saveCompany=async()=>{if(!canManage||companySaving||logoReading)return;
    setCompanySaving(true);setCompanyError('');setCompanyNotice('');
    try{const saved=await apiRequest<{profile:CompanyProfile}>('/tenant/company-profile',{method:'PUT',body:JSON.stringify(company)});
      setCompany(saved.profile);setCompanyEditing(false);setCompanyBeforeEdit(null);setCompanyNotice('Company details saved.');}
    catch(error){setCompanyError(error instanceof Error?error.message:String(error));}
    finally{setCompanySaving(false)}
  };
  const [draft, setDraft] = useState<CurrencySettingsMetadata>({
    corporateCurrency: 'USD',
    standardVatRate: 20,
    currencies: [{ currencyIsoCode: 'USD', conversionRate: 1 }]
  });
  const [corporateCode, setCorporateCode] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const previousValue = useRef<{ draft: CurrencySettingsMetadata; corporateCode: string } | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void apiRequest<CurrencySettingsMetadata>('/metadata/currencies')
      .then((settings) => {
        if (active) {
          setDraft(settings);
          setCorporateCode(settings.corporateCurrency);
          setLoaded(true);
        }
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : String(loadError));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const beginEdit = (row: string) => {
    if (!canManage || saving || loading || editingRow) return;
    previousValue.current = { draft, corporateCode };
    setEditingRow(row);
    setError('');
    setNotice('');
  };
  const cancelEdit = () => {
    if (saving) return;
    if (previousValue.current) {
      setDraft(previousValue.current.draft);
      setCorporateCode(previousValue.current.corporateCode);
    }
    previousValue.current = null;
    setEditingRow(null);
    setError('');
  };
  const setCorporateCurrency = () => {
    const normalized = corporateCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalized)) {
      setError('Corporate currency must be a three-letter ISO 4217 code.');
      return;
    }
    setDraft((current) => {
      const hasCorporate = current.currencies.some((currency) => currency.currencyIsoCode === normalized);
      return {
        ...current,
        corporateCurrency: normalized,
        currencies: hasCorporate
          ? current.currencies.map((currency) => currency.currencyIsoCode === normalized
            ? { ...currency, conversionRate: 1 } : currency)
          : [...current.currencies, { currencyIsoCode: normalized, conversionRate: 1 }]
      };
    });
    setError('');
    setNotice('');
  };

  const save = async () => {
    if (!canManage || !editingRow || saving) return;
    const normalizedCorporateCode = corporateCode.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(normalizedCorporateCode)) {
      setError('Corporate currency must be a three-letter ISO 4217 code.');
      return;
    }
    if (!Number.isFinite(draft.standardVatRate) || draft.standardVatRate < 0 || draft.standardVatRate > 100) {
      setError('Standard VAT rate must be between 0 and 100 percent.');
      return;
    }
    const hasCorporateCurrency = draft.currencies.some((currency) => currency.currencyIsoCode === normalizedCorporateCode);
    const settings: CurrencySettingsMetadata = {
      corporateCurrency: normalizedCorporateCode,
      standardVatRate: draft.standardVatRate,
      currencies: hasCorporateCurrency
        ? draft.currencies.map((currency) => currency.currencyIsoCode === normalizedCorporateCode
          ? { ...currency, conversionRate: 1 } : currency)
        : [...draft.currencies, { currencyIsoCode: normalizedCorporateCode, conversionRate: 1 }]
    };
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const saved = await apiRequest<CurrencySettingsMetadata>('/metadata/currencies', {
        method: 'PUT', body: JSON.stringify(settings)
      });
      setDraft(saved);
      setCorporateCode(saved.corporateCurrency);
      previousValue.current = null;
      setEditingRow(null);
      setNotice('Company currency settings saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  };

  const addCurrency = () => {
    if (!canManage || editingRow || loading) return;
    const index = draft.currencies.length;
    beginEdit(`currency-${index}`);
    setDraft((current) => ({
      ...current, currencies: [...current.currencies, { currencyIsoCode: '', conversionRate: 1 }]
    }));
  };

  return <div className="home-content settings-read-first-page company-settings-page">
    <PageHeading eyebrow="Company Settings" title="Company Settings"
      description="Manage your organisation settings, base currency, VAT and exchange rates in one workspace." />
    <section className="surface permission-section company-profile-section" aria-label="Company details">
      <div className="section-toolbar"><div><h2>Company details</h2><p>Organisation, contact and regional information.</p></div>
      {canManage&&!companyEditing&&!companyLoading&&<button type="button" className="btn" onClick={()=>{setCompanyBeforeEdit({...company});setCompanyEditing(true);}}>Edit details</button>}</div>
      {companyLoading?<p>Loading company details…</p>:<><div className="company-profile-logo">{(company.logoUrl?.startsWith("data:image/")||company.logoUrl?.startsWith("https://"))?<img src={company.logoUrl} alt="Company logo" />:<span aria-label="No logo configured">No logo</span>}</div><div className="company-profile-grid">{companyEditing&&<div className="company-profile-field" data-company-field="logoUrl"><label htmlFor="company-logo-upload">Company logo</label><input id="company-logo-upload" type="file" accept="image/png,image/jpeg,image/webp" disabled={companySaving||logoReading} onChange={event=>{void selectCompanyLogo(event.target.files?.[0]);event.target.value='';}}/><small>PNG, JPG or WebP · maximum 128 KB</small>{company.logoUrl&&<button className="btn" type="button" disabled={companySaving||logoReading} onClick={()=>setCompany(previous=>({...previous,logoUrl:''}))}>Remove logo</button>}</div>}
      {companyFields.map(field=><div className="company-profile-field" data-company-field={field.key} key={field.key}><label htmlFor={'company-'+field.key}>{field.label}</label>
        {companyEditing?<input id={'company-'+field.key} className="form-control" value={company[field.key]}
          onChange={event=>setCompany(previous=>({...previous,[field.key]:event.target.value}))}/>
        :<p>{company[field.key]||'Not provided'}</p>}</div> )}</div></>}
      {companyEditing&&<div className="settings-read-first-toolbar">
        <button type="button" className="btn" disabled={companySaving} onClick={()=>{setCompany(companyBeforeEdit??blankCompanyProfile);setCompanyEditing(false);setCompanyBeforeEdit(null);}}>Cancel</button>
        <button type="button" className="btn btn-brand" disabled={companySaving||logoReading} onClick={()=>void saveCompany()}>{companySaving?'Saving…':'Save details'}</button></div>}
      {companyError&&<p className="form-error" role="alert">{companyError}</p>}
      {companyNotice&&<p className="form-success" role="status">{companyNotice}</p>}
    </section>
    <section className="surface permission-section">
      <div className="section-toolbar">
        <div><h2>Currency & Tax</h2>
          <p>Rates express units of corporate currency per one unit of the active currency.</p></div>
      </div>
      {loading ? <p className="permission-help">Loading currency settings…</p> : loaded ? <>
        <div className="settings-read-first-section">
          {editingRow === 'corporate'
            ? <div className="settings-edit-row">
                <PlatformPageSlot slotKey="field-settings-15"><label className="form-label">Corporate Currency (ISO 4217)
                  <input autoFocus className="form-control" value={corporateCode} maxLength={3}
                    onChange={(event) => { setCorporateCode(event.target.value.toUpperCase()); setError(''); }}
                    onBlur={setCorporateCurrency} />
                </label></PlatformPageSlot>
              </div>
            : <SettingsViewRow label="Corporate Currency (ISO 4217)" value={draft.corporateCurrency}
                canEdit={canManage && !editingRow} onEdit={() => beginEdit('corporate')} />}
        </div>
        <div className="settings-read-first-section">
          {editingRow === 'standard-vat-rate'
            ? <div className="settings-edit-row">
                <PlatformPageSlot slotKey="field-settings-17"><label className="form-label">Standard VAT rate (%)
                  <input autoFocus className="form-control" type="number" min="0" max="100" step="0.01"
                    value={draft.standardVatRate}
                    onChange={(event) => setDraft((current) => ({
                      ...current, standardVatRate: Number(event.target.value)
                    }))} />
                </label></PlatformPageSlot>
              </div>
            : <SettingsViewRow label="Standard VAT rate" value={`${draft.standardVatRate}%`}
                canEdit={canManage && !editingRow} onEdit={() => beginEdit('standard-vat-rate')} />}
        </div>
        <h3 className="permission-section-heading">Active Currencies</h3>
        <div className="settings-read-first-section">
          {draft.currencies.map((currency, index) => (
            editingRow === `currency-${index}`
              ? <div className="settings-edit-row" key={`currency-edit-${index}`}>
                  <div className="settings-edit-row-grid">
                    <PlatformPageSlot slotKey="field-settings-16"><label className="form-label">Currency Code
                      <input autoFocus className="form-control" value={currency.currencyIsoCode} maxLength={3}
                        disabled={currency.currencyIsoCode === draft.corporateCurrency}
                        onChange={(event) => {
                          const currencyIsoCode = event.target.value.toUpperCase();
                          setDraft((current) => ({
                            ...current, currencies: current.currencies.map((item, itemIndex) => itemIndex === index
                              ? { ...item, currencyIsoCode } : item)
                          }));
                        }} />
                    </label></PlatformPageSlot>
                    <PlatformPageSlot slotKey="field-settings-17"><label className="form-label">Conversion Rate
                      <input className="form-control" type="number" min="0" step="any"
                        value={currency.currencyIsoCode === draft.corporateCurrency ? 1 : currency.conversionRate}
                        disabled={currency.currencyIsoCode === draft.corporateCurrency}
                        onChange={(event) => {
                          const conversionRate = Number(event.target.value);
                          setDraft((current) => ({
                            ...current, currencies: current.currencies.map((item, itemIndex) => itemIndex === index
                              ? { ...item, conversionRate } : item)
                          }));
                        }} />
                    </label></PlatformPageSlot>
                  </div>
                  {currency.currencyIsoCode !== draft.corporateCurrency && <div className="settings-read-first-toolbar">
                    <button type="button" className="btn" onClick={() => {
                      setDraft((current) => ({
                        ...current, currencies: current.currencies.filter((_item, itemIndex) => itemIndex !== index)
                      }));
                      setEditingRow('removed-currency');
                    }}><Trash2 size={14} />Remove Currency</button>
                  </div>}
                </div>
              : <SettingsViewRow key={`currency-view-${index}`}
                  label={currency.currencyIsoCode || 'New currency'}
                  value={`Conversion rate: ${currency.currencyIsoCode === draft.corporateCurrency ? 1 : currency.conversionRate}`}
                  canEdit={canManage && !editingRow && currency.currencyIsoCode !== draft.corporateCurrency}
                  onEdit={() => beginEdit(`currency-${index}`)} />
          ))}
        </div>
        {canManage && !editingRow && <button className="btn" type="button" onClick={addCurrency}>
          <Plus size={14} />Add Currency
        </button>}
        {canManage && editingRow && <div className="settings-read-first-toolbar">
          <button className="btn" type="button" disabled={saving} onClick={cancelEdit}>Cancel</button>
          <button className="btn btn-brand" type="button" onClick={() => void save()} disabled={saving}>
            <Save size={14} />{saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>}
      </> : null}
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="form-success" role="status">{notice}</p>}
    </section>
  </div>;
}


return { AutomationSettingsWorkspace, TenantEmailRecoverySettings, TenantUserLockSettings, AccountSessionSecurity, TenantSecurityAudit, TenantMfaSettings, CompanySettings };
}
