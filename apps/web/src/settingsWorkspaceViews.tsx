import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Save, Trash2, Plus, Lock, Unlock } from 'lucide-react';
import SettingsViewRow from './SettingsViewRow';
import {PlatformPageSlot} from './PlatformPageSlot';
import type { CurrencySettingsMetadata } from './metadata';

type ApiRequest = <T>(path: string, init?: RequestInit) => Promise<T>;
type PageHeadingProps = { eyebrow?: string; title: string; description?: string; actions?: ReactNode };
export function createSettingsViews(apiRequest: ApiRequest, PageHeading: (props: PageHeadingProps) => ReactNode) {
type AutomationSettingsDraft = {
  autoRetryFailedFlows: boolean;
  maxRetryAttempts: number;
  conversationIdleMinutes: number;
};

function AutomationSettingsWorkspace({ canManage }: { canManage: boolean }) {
  const [draft, setDraft] = useState<AutomationSettingsDraft>({
    autoRetryFailedFlows: false, maxRetryAttempts: 10, conversationIdleMinutes: 15
  });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const beforeEdit = useRef<AutomationSettingsDraft | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let active = true;
    void apiRequest<AutomationSettingsDraft>('/metadata/automation-settings')
      .then((result) => { if (active) { setDraft(result); setLoaded(true); } })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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
  return <div className="connector-settings-page settings-read-first-page">
    <PageHeading eyebrow="Setup / Automation" title="Process Automation Settings"
      description="Review failed-flow retries and conversational inactivity limits." />
    <section className="surface permission-section" style={{ maxWidth: 800 }}>
      {loading ? <p>Loading process automation settings…</p> : loaded ? <>
        <h2>Execution safety</h2>
        <div className="settings-read-first-section">
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
  const [users, setUsers] = useState<Array<{ id: string; name: string; email: string; active: boolean; lockedUntil: number | null }>>([]);
  const [permitted, setPermitted] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const load = async () => {
    const response = await apiRequest<{ users: Array<{ id: string; name: string; email: string; active: boolean; lockedUntil: number | null }> }>('/auth/user-locks');
    setUsers(response.users); setPermitted(true);
  };
  useEffect(() => { void load().catch(() => setPermitted(false)); }, []);
  if (!permitted) return null;
  const changeLock = async (userId: string, lock: boolean) => {
    setBusy(true); setMessage('');
    try {
      await apiRequest('/auth/users/' + encodeURIComponent(userId) + (lock ? '/lock' : '/unlock'), {
        method: 'POST', body: JSON.stringify(lock ? { durationMinutes: 60 } : {})
      });
      await load();
      setMessage(lock ? 'User locked and existing sessions revoked.' : 'User unlocked.');
    } catch (reason) { setMessage(reason instanceof Error ? reason.message : 'Unable to update account lock'); }
    finally { setBusy(false); }
  };
  return <section className="surface permission-section">
    <h2>User account locks</h2>
    <p>Security administrators can lock or unlock an account. Locking immediately invalidates its active tokens and sessions.</p>
    {message && <p role="status">{message}</p>}
    <ul>{users.map((user) => <li key={user.id}>
      {user.name} ({user.email}) — {user.lockedUntil && user.lockedUntil > Date.now()
        ? 'Locked until ' + new Date(user.lockedUntil).toLocaleString()
        : user.active ? 'Active' : 'Inactive'}
      {' '}
      <button className="btn btn-small" disabled={busy || !user.active}
        onClick={() => void changeLock(user.id, !(user.lockedUntil && user.lockedUntil > Date.now()))}>
        {user.lockedUntil && user.lockedUntil > Date.now() ? 'Unlock' : 'Lock for 1 hour'}
      </button>
    </li>)}</ul>
  </section>;
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
  const [events, setEvents] = useState<Array<{ id: string; at: string; actorUserId: string; action: string; details?: Record<string, string> }>>([]);
  const [permitted, setPermitted] = useState(false);
  useEffect(() => {
    let active = true;
    void apiRequest<{ events: Array<{ id: string; at: string; actorUserId: string; action: string; details?: Record<string, string> }> }>('/auth/security-events?limit=50')
      .then((response) => { if (active) { setEvents(response.events); setPermitted(true); } })
      .catch(() => { if (active) setPermitted(false); });
    return () => { active = false; };
  }, []);
  if (!permitted) return null;
  return <section className="surface permission-section">
    <h2>Security activity</h2>
    <p>Recent tenant security events. Only authorized security administrators can view this history.</p>
    {!events.length ? <p>No security activity recorded.</p> :
      <ul>{events.map((event) => <li key={event.id}>
        <strong>{event.action}</strong> · {new Date(event.at).toLocaleString()}
        {event.details?.from && event.details?.to ? ' · ' + event.details.from + ' → ' + event.details.to : ''}
      </li>)}</ul>}
  </section>;
}

function TenantMfaSettings({ onReauthenticate, canManage }: { onReauthenticate: () => void; canManage: boolean }) {
  const [mode, setMode] = useState<TenantMfaMode>('Off');
  const [draftMode, setDraftMode] = useState<TenantMfaMode>('Off');
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [authenticatorAction, setAuthenticatorAction] = useState<'enroll' | 'disable' | null>(null);
  const [canConfigure, setCanConfigure] = useState(false);
  const [enrolled, setEnrolled] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState<{ enrollment_token: string; setup_secret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    void apiRequest<{ mode: TenantMfaMode; enrolled: boolean }>('/auth/mfa/status')
      .then((status) => { if (active) { setMode(status.mode); setDraftMode(status.mode); setEnrolled(status.enrolled); } })
      .catch((failure: unknown) => { if (active) setError(failure instanceof Error ? failure.message : String(failure)); });
    void apiRequest<{ mode: TenantMfaMode }>('/auth/mfa/policy')
      .then((policy) => { if (active) { setCanConfigure(true); setDraftMode(policy.mode); } })
      .catch(() => { if (active) setCanConfigure(false); });
    return () => { active = false; };
  }, []);
  const savePolicy = async () => {
    if (!canManage || !canConfigure || !editingPolicy || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest('/auth/mfa/policy', { method: 'PUT', body: JSON.stringify({ mode: draftMode }) });
      // A policy change can make the existing session ineligible for further requests.
      onReauthenticate();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save policy');
    } finally { setBusy(false); }
  };
  const startEnrollment = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const enrollment = await apiRequest<{ enrollment_token: string; setup_secret: string }>('/auth/mfa/enroll', {
        method: 'POST', body: JSON.stringify({ password })
      });
      setPending(enrollment); setCode('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to begin enrollment');
    } finally { setBusy(false); }
  };
  const confirmEnrollment = async () => {
    if (!pending) return;
    setBusy(true); setError('');
    try {
      await apiRequest('/auth/mfa/enroll/confirm', {
        method: 'POST', body: JSON.stringify({ enrollment_token: pending.enrollment_token, code })
      });
      onReauthenticate();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to verify authenticator');
    } finally { setBusy(false); }
  };
  const disableEnrollment = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      await apiRequest('/auth/mfa/disable', { method: 'POST', body: JSON.stringify({ password, code }) });
      onReauthenticate();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to disable MFA');
    } finally { setBusy(false); }
  };
  return <section className="surface permission-section">
    <h2>Multi-factor authentication</h2>
    <p>Authenticator-based MFA is configured separately for each tenant. Server-side policy controls sign-in and API access.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    <>
      <div className="settings-read-first-section">
        {editingPolicy ? <div className="settings-edit-row">
          <PlatformPageSlot slotKey="field-settings-10"><label className="form-label" htmlFor="tenant-mfa-mode">Tenant MFA policy
            <select className="form-control" id="tenant-mfa-mode" value={draftMode}
              onChange={(event) => setDraftMode(event.target.value as TenantMfaMode)}>
              <option value="Off">Off — no MFA challenge</option>
              <option value="Optional">Optional — individual users can enroll</option>
              <option value="Required">Required — every user must enroll and verify</option>
            </select>
          </label></PlatformPageSlot>
          <p className="settings-view-row-help">Changing the policy may require users to sign in again.</p>
        </div> : <SettingsViewRow label="Tenant MFA policy" value={mode}
          canEdit={canManage && canConfigure} onEdit={() => { setDraftMode(mode); setEditingPolicy(true); }} />}
      </div>
      {editingPolicy && canManage && <div className="settings-read-first-toolbar">
        <button className="btn" type="button" disabled={busy}
          onClick={() => { setDraftMode(mode); setEditingPolicy(false); }}>Cancel</button>
        <button className="btn btn-brand" type="button" disabled={busy || draftMode === mode}
          onClick={() => void savePolicy()}>
          <Save size={14} />{busy ? 'Saving…' : 'Save changes'}
        </button>
      </div>}
    </>
    <h3>My authenticator</h3>
    <p>{enrolled ? 'Your account has an authenticator enrolled.' : 'Your account has no authenticator enrolled.'}</p>
    {mode === 'Off' && <p>Ask a tenant security administrator to enable Optional MFA before enrolling.</p>}
    {mode !== 'Off' && !enrolled && !authenticatorAction && <button className="btn" type="button" onClick={() => setAuthenticatorAction('enroll')}>Set up authenticator</button>}
    {mode !== 'Off' && !enrolled && authenticatorAction === 'enroll' && <div className="settings-edit-row">
      <PlatformPageSlot slotKey="field-settings-11"><label className="form-label" htmlFor="mfa-current-password">Current password</label></PlatformPageSlot>
      <input className="form-control" id="mfa-current-password" type="password" autoComplete="current-password"
        value={password} onChange={(event) => setPassword(event.target.value)} />
      {!pending && <button className="btn" disabled={busy || !password} onClick={() => void startEnrollment()}>Continue setup</button>}
      {pending && <>
        <p>Add this key to your authenticator app, then enter its six-digit code.</p>
        <p><strong>Setup key:</strong> <code style={{ overflowWrap: 'anywhere' }}>{pending.setup_secret}</code></p>
        <PlatformPageSlot slotKey="field-settings-12"><label className="form-label" htmlFor="mfa-setup-code">Authenticator code</label></PlatformPageSlot>
        <input className="form-control" id="mfa-setup-code" type="text" inputMode="numeric"
          pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code"
          value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))} />
        <button className="btn btn-brand" disabled={busy || !/^[0-9]{6}$/.test(code)} onClick={() => void confirmEnrollment()}>Confirm enrollment</button>
      </>}
      <button type="button" className="btn" disabled={busy} onClick={() => {
        setAuthenticatorAction(null); setPending(null); setPassword(''); setCode('');
      }}>Cancel</button>
    </div>}
    {enrolled && mode !== 'Required' && !authenticatorAction && <button className="btn" type="button"
      onClick={() => setAuthenticatorAction('disable')}>Disable authenticator</button>}
    {enrolled && mode !== 'Required' && authenticatorAction === 'disable' && <div className="settings-edit-row">
      <p>To disable your authenticator, confirm your password and a fresh code.</p>
      <PlatformPageSlot slotKey="field-settings-13"><label className="form-label" htmlFor="mfa-disable-password">Current password</label></PlatformPageSlot>
      <input className="form-control" id="mfa-disable-password" type="password" autoComplete="current-password"
        value={password} onChange={(event) => setPassword(event.target.value)} />
      <PlatformPageSlot slotKey="field-settings-14"><label className="form-label" htmlFor="mfa-disable-code">Authenticator code</label></PlatformPageSlot>
      <input className="form-control" id="mfa-disable-code" type="text" inputMode="numeric"
        pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code"
        value={code} onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ''))} />
      <button className="btn" disabled={busy || !password || !/^[0-9]{6}$/.test(code)}
        onClick={() => void disableEnrollment()}>Confirm disable MFA</button>
      <button type="button" className="btn" disabled={busy} onClick={() => {
        setAuthenticatorAction(null); setPassword(''); setCode('');
      }}>Cancel</button>
    </div>}
  </section>;
}

function CompanySettings({ canManage }: { canManage: boolean }) {
  const [draft, setDraft] = useState<CurrencySettingsMetadata>({
    corporateCurrency: 'USD',
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
    const hasCorporateCurrency = draft.currencies.some((currency) => currency.currencyIsoCode === normalizedCorporateCode);
    const settings: CurrencySettingsMetadata = {
      corporateCurrency: normalizedCorporateCode,
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

  return <div className="home-content settings-read-first-page">
    <PageHeading eyebrow="Company Settings" title="Company Information"
      description="View your corporate currency and active conversion rates used by currency formulas." />
    <section className="surface permission-section">
      <div className="section-toolbar">
        <div><h2>Currency Settings</h2>
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
