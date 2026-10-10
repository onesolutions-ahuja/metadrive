import { useState } from 'react';
import { Eye, KeyRound, Pencil, Plus, RotateCw, Trash2, X } from 'lucide-react';
import type { NamedCredentialMetadata } from './metadata';

type CredentialInput = {
  id?: string;
  name: string;
  label: string;
  protocol: NamedCredentialMetadata['protocol'];
  baseUrl: string;
  authType: NamedCredentialMetadata['authType'];
  headerName?: string;
  username?: string;
  secret?: string;
};

type CredentialDraft = Omit<CredentialInput, 'id'> & { id?: string };

const blankCredential = (): CredentialDraft => ({
  name: '',
  label: '',
  protocol: 'HTTPS',
  baseUrl: '',
  authType: 'None',
  headerName: '',
  username: '',
  secret: ''
});

export default function NamedCredentials({
  credentials,
  canManage,
  encryptionReady,
  onSave,
  onDelete,
  onRotate,
  onTest
}: {
  credentials: NamedCredentialMetadata[];
  canManage: boolean;
  encryptionReady: boolean | null;
  onSave: (credential: CredentialInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRotate: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<{ connected: boolean; status?: number; message: string }>;
}) {
  const [draft, setDraft] = useState<CredentialDraft | null>(null);
  const [viewing, setViewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState('');
  const [testResults, setTestResults] = useState<Record<string, string>>({});

  const updateDraft = (update: Partial<CredentialDraft>) => {
    setDraft((current) => current ? { ...current, ...update } : current);
    setError('');
  };

  const editCredential = (credential?: NamedCredentialMetadata, readOnly = false) => {
    setError('');
    setViewing(readOnly);
    setDraft(credential ? {
      id: credential.id,
      name: credential.name,
      label: credential.label,
      protocol: credential.protocol,
      baseUrl: credential.baseUrl,
      authType: credential.authType,
      headerName: credential.headerName,
      username: '',
      secret: ''
    } : blankCredential());
  };

  const submit = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setError('');
    try {
      await onSave({
        ...draft,
        name: draft.name.trim(),
        label: draft.label.trim(),
        baseUrl: draft.baseUrl.trim(),
        ...(draft.headerName?.trim() ? { headerName: draft.headerName.trim() } : {}),
        ...(draft.username?.trim() ? { username: draft.username.trim() } : {}),
        ...(draft.secret ? { secret: draft.secret } : {})
      });
      setDraft(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save Named Credential');
    } finally {
      setSaving(false);
    }
  };

  const visibleCredentials = credentials.filter((credential) =>
    `${credential.label} ${credential.name} ${credential.protocol} ${credential.baseUrl}`
      .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  const performAction = async (credential: NamedCredentialMetadata, action: 'delete' | 'rotate') => {
    if (busyId) return;
    if (action === 'delete' && !window.confirm(`Delete Named Credential "${credential.label}"? Credentials used by a Flow or other feature cannot be deleted.`)) return;
    setBusyId(credential.id);
    setError('');
    try {
      if (action === 'delete') await onDelete(credential.id);
      else await onRotate(credential.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Unable to ${action} Named Credential`);
    } finally {
      setBusyId('');
    }
  };

  const testCredential = async (credential: NamedCredentialMetadata) => {
    if (busyId) return;
    setBusyId(credential.id);
    setError('');
    setTestResults((current) => ({ ...current, [credential.id]: 'Testing connection…' }));
    try {
      const result = await onTest(credential.id);
      setTestResults((current) => ({ ...current, [credential.id]: `${result.connected ? 'Connected' : 'Failed'}: ${result.message}` }));
    } catch (testError) {
      setTestResults((current) => ({ ...current, [credential.id]: `Failed: ${testError instanceof Error ? testError.message : 'Unable to test connection'}` }));
    } finally {
      setBusyId('');
    }
  };

  return <section className="surface object-setting-surface named-credentials-page">
    <div className="section-toolbar">
      <div><h2>Named Credentials</h2><p>Manage tenant-wide HTTPS and SMTP credentials used by Flow callouts, Email Alerts, and supported delivery features.</p></div>
      <button className="btn btn-brand" disabled={!canManage || encryptionReady === false} title={!canManage ? 'Requires OneEngine Named Credentials permission' : encryptionReady === false ? 'Credential encryption is not configured on the server' : undefined} onClick={() => editCredential()}><Plus size={14} />New Named Credential</button>
    </div>
    <div className="record-type-create">
      <input className="form-control" type="search" aria-label="Search Named Credentials" placeholder="Search credentials…" value={query} onChange={(event) => setQuery(event.target.value)} />
    </div>
    {error && <div className="records-message" role="alert">{error}</div>}
    {!canManage && <div className="info-callout" role="alert">This account cannot create credentials. Assign the OneEngine Named Credentials permission set to your user in Settings → Permission Sets.</div>}
    {encryptionReady === false && <div className="records-message" role="alert">Credential encryption is not configured on the server. Set METADRIVE_CREDENTIAL_KEYS and METADRIVE_CREDENTIAL_ACTIVE_KEY_ID in Render before creating or testing credentials. Existing encrypted keys must be preserved.</div>}
    <div className="table-scroll">
      <table className="slds-table">
        <thead><tr><th>Label</th><th>API Name</th><th>Protocol</th><th>Base URL</th><th>Authentication</th><th>Secret</th><th>Updated</th><th>Connection Test</th><th>Actions</th></tr></thead>
        <tbody>{visibleCredentials.map((credential) => <tr key={credential.id}>
          <td><button className="btn btn-link" onClick={() => editCredential(credential, true)}>{credential.label}</button></td>
          <td>{credential.name}</td>
          <td>{credential.protocol}</td>
          <td>{credential.baseUrl}</td>
          <td>{credential.authType}</td>
          <td>{credential.authType === 'None' ? 'Not required' : credential.hasSecret ? 'Stored · masked' : 'Not configured'}</td>
          <td>{new Date(credential.updatedAt).toLocaleString()}</td>
          <td role="status">{testResults[credential.id] ?? 'Not tested'}</td>
          <td><div className="toolbar-actions">
            <button className="btn btn-small" aria-label={`Test connection for ${credential.label}`} disabled={!canManage || credential.protocol !== 'HTTPS' || Boolean(busyId)} title={credential.protocol !== 'HTTPS' ? 'SMTP testing is not supported' : 'Test saved HTTPS base URL with stored authentication'} onClick={() => void testCredential(credential)}>{busyId === credential.id ? 'Testing…' : 'Test Connection'}</button>
            <button className="icon-button subtle" aria-label={`View ${credential.label}`} onClick={() => editCredential(credential, true)}><Eye size={14} /></button>
            <button className="icon-button subtle" aria-label={`Edit ${credential.label}`} title={!canManage ? 'Manage Named Credentials permission required' : 'Edit credential'} disabled={!canManage || Boolean(busyId)} onClick={() => editCredential(credential)}><Pencil size={14} /></button>
            <button className="icon-button subtle" aria-label={`Rotate key for ${credential.label}`} title="Rotate encryption key" disabled={!canManage || Boolean(busyId)} onClick={() => void performAction(credential, 'rotate')}><RotateCw size={14} /></button>
            <button className="icon-button subtle" aria-label={`Delete ${credential.label}`} disabled={!canManage || Boolean(busyId)} onClick={() => void performAction(credential, 'delete')}><Trash2 size={14} /></button>
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>
    {!visibleCredentials.length && <div className="empty-state">{credentials.length ? 'No Named Credentials match your search.' : 'No Named Credentials are configured yet.'}</div>}
    {draft && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDraft(null); }}>
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="named-credential-title">
        <div className="modal-header"><h2 id="named-credential-title">{viewing ? 'Named Credential Details' : draft.id ? 'Edit Named Credential' : 'New Named Credential'}</h2><button className="icon-button dark" aria-label="Close" disabled={saving} onClick={() => setDraft(null)}><X size={18} /></button></div>
        <p className="modal-copy"><KeyRound size={14} /> Credentials are shared within this tenant. Secrets are encrypted at rest and never displayed after saving.</p>
        <fieldset disabled={viewing} style={{ border: 0, padding: 0, margin: 0 }}>
        <label className="form-label">API Name<input className="form-control" autoComplete="off" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value.replace(/[^A-Za-z0-9_]/g, '') })} placeholder="Partner_API" /></label>
        <label className="form-label">Label<input className="form-control" value={draft.label} onChange={(event) => updateDraft({ label: event.target.value })} placeholder="Partner API" /></label>
        <label className="form-label">Protocol<select className="form-control" value={draft.protocol} onChange={(event) => {
          const protocol = event.target.value as NamedCredentialMetadata['protocol'];
          updateDraft({ protocol, authType: protocol === 'SMTP' && !['None', 'Basic'].includes(draft.authType) ? 'Basic' : draft.authType });
        }}><option>HTTPS</option><option>SMTP</option></select></label>
        <label className="form-label">{draft.protocol === 'SMTP' ? 'SMTP Server URL' : 'Base URL'}<input className="form-control" type="url" value={draft.baseUrl} onChange={(event) => updateDraft({ baseUrl: event.target.value })} placeholder={draft.protocol === 'SMTP' ? 'smtp://smtp.example.com:587' : 'https://api.example.com/'} /></label>
        <label className="form-label">Authentication<select className="form-control" value={draft.authType} onChange={(event) => updateDraft({ authType: event.target.value as NamedCredentialMetadata['authType'] })}>
          {(draft.protocol === 'SMTP' ? ['None', 'Basic'] : ['None', 'Bearer', 'Basic', 'API Key']).map((authType) => <option key={authType}>{authType}</option>)}
        </select></label>
        {draft.authType === 'API Key' && <label className="form-label">API Key Header<input className="form-control" value={draft.headerName ?? ''} onChange={(event) => updateDraft({ headerName: event.target.value })} placeholder="X-API-Key" /></label>}
        {draft.authType === 'Basic' && <label className="form-label">Username<input className="form-control" autoComplete="off" value={draft.username ?? ''} onChange={(event) => updateDraft({ username: event.target.value })} placeholder={draft.id ? 'Leave blank to retain' : ''} /></label>}
        {draft.authType !== 'None' && <label className="form-label">{draft.authType === 'Basic' ? 'Password' : 'Secret'}<input className="form-control" type="password" autoComplete="new-password" value={draft.secret ?? ''} onChange={(event) => updateDraft({ secret: event.target.value })} placeholder={draft.id ? 'Stored securely · blank keeps existing secret' : 'Enter secret'} /></label>}
        {draft.id && <div className="info-callout">Leave the secret blank to keep the existing secret. Changing authentication type requires a new secret.</div>}
        {error && <div className="records-message" role="alert">{error}</div>}
        </fieldset>
        <div className="modal-actions"><button className="btn" disabled={saving} onClick={() => setDraft(null)}>{viewing ? 'Close' : 'Cancel'}</button>{!viewing && <button className="btn btn-brand" disabled={saving || !draft.name.trim() || !draft.label.trim() || !draft.baseUrl.trim() || (draft.authType !== 'None' && !draft.id && !draft.secret) || (draft.authType === 'Basic' && !draft.id && !draft.username?.trim())} onClick={() => void submit()}>{saving ? 'Saving…' : draft.id ? 'Save Changes' : 'Save Named Credential'}</button>}{viewing && canManage && <button className="btn btn-brand" onClick={() => setViewing(false)}><Pencil size={14} />Edit</button>}</div>
      </section>
    </div>}
  </section>;
}
