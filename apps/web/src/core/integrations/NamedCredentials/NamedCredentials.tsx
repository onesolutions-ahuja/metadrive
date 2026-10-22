import {PlatformPageSlot} from '../../platform/Workspace/PlatformPageSlot';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useModalAccessibility } from '../../accessibility/Modal/useModalAccessibility';
import { Eye, KeyRound, Pencil, Plus, RotateCw, Trash2, X } from 'lucide-react';
import type { NamedCredentialMetadata } from '../../metadata/Definitions/metadata';

type CredentialInput = {
  id?: string;
  name: string;
  label: string;
  protocol: NamedCredentialMetadata['protocol'];
  baseUrl: string;
  authType: NamedCredentialMetadata['authType'];
  headerName?: string;
  configuration?: Record<string, string>;
  username?: string;
  secret?: string;
  webhookRequired?: boolean;
  webhookSecret?: string;
};

type CredentialDraft = Omit<CredentialInput, 'id'> & { id?: string };

const blankCredential = (): CredentialDraft => ({
  name: '',
  label: '',
  protocol: 'HTTPS',
  baseUrl: '',
  authType: 'None',
  headerName: '',
  configuration: {},
  username: '',
  secret: '',
  webhookRequired: false,
  webhookSecret: ''
});

export default function NamedCredentials({
  credentials,
  canManage,
  canManageSecrets = true,
  canTest,
  encryptionReady,
  providerName,
  preset,
  fieldLabels,
  embedded = false,
  onSave,
  onDelete,
  onRotate,
  onTest,
  onToggleEnabled,
  onOAuthAuthorize,
}: {
  credentials: NamedCredentialMetadata[];
  canManage: boolean;
  canManageSecrets?: boolean;
  canTest?: boolean;
  encryptionReady: boolean | null;
  providerName?: string;
  preset?: { name: string; label: string; baseUrl: string; authType: CredentialDraft['authType']; configuration: Record<string, string> };
  embedded?: boolean;
  fieldLabels?: Record<string,string>;
  onSave: (credential: CredentialInput) => Promise<{credential:NamedCredentialMetadata;webhookVerifyToken?:string}>;
  onDelete: (id: string) => Promise<void>;
  onRotate?: (id: string) => Promise<void>;
  onTest?: (id: string) => Promise<{ connected: boolean; status?: number; message: string }>;
  onToggleEnabled?: (id: string, enabled: boolean) => Promise<void>;
  onOAuthAuthorize?: (id:string)=>Promise<string>;
}) {
  const [draft, setDraft] = useState<CredentialDraft | null>(null);
  const modalRef = useRef<HTMLElement>(null);
  const [viewing, setViewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const dismissModal = useCallback(() => { if (!saving) setDraft(null); }, [saving]);
  useModalAccessibility(Boolean(draft), modalRef, dismissModal);
  const [error, setError] = useState('');
  const [savedWebhook,setSavedWebhook]=useState<{callbackUrl:string;verifyToken?:string}|null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const fieldErrors = { name: !/^[A-Za-z][A-Za-z0-9_]*$/.test(draft?.name ?? '') ? 'Use a name starting with a letter, containing only letters, numbers and underscores.' : '', label: !(draft?.label.trim()) ? 'Label is required.' : '', baseUrl: !(draft?.baseUrl.trim()) ? 'URL is required.' : draft?.protocol === 'HTTPS' && !/^https:\/\//i.test(draft.baseUrl.trim()) ? 'Use an HTTPS URL.' : '' };
  const blurField = (field: keyof typeof fieldErrors) => setTouched(current => ({...current, [field]: true}));
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [busyId, setBusyId] = useState('');
  const [toggleBusyId, setToggleBusyId] = useState('');
  const [testResults, setTestResults] = useState<Record<string, string>>({});
  const credentialRevisions = credentials.map(({ id, enabled, updatedAt }) => `${id}:${enabled}:${updatedAt}`).join('|');
  useEffect(() => { setTestResults({}); }, [credentialRevisions]);
  const updateDraft = (update: Partial<CredentialDraft>) => {
    setDraft((current) => current ? { ...current, ...update } : current);
    setError('');
  };

  // Meta-owned non-secret configuration fields. Access tokens remain in the
  // encrypted Secret field, not in these editable ID/settings variables.
  const whatsAppFields:Record<string,string>={
    public_graphApiVersion:'',public_wabaId:'',public_phoneNumberId:'',
    public_businessPortfolioId:'',public_metaAppId:'',public_businessPhoneE164:'',
    public_templateLanguage:'en_US',public_webhookCallbackUrl:'',public_displayName:''
  };
  const editCredential = (credential?: NamedCredentialMetadata, readOnly = false) => {
    setError('');
    setSavedWebhook(null);
    setTouched({});
    setViewing(readOnly);
    setDraft(credential ? {
      id: credential.id,
      name: credential.name,
      label: credential.label,
      protocol: credential.protocol,
      baseUrl: credential.baseUrl,
      authType: credential.authType,
      headerName: credential.headerName,
      configuration: { ...(credential.name==='WhatsApp_Cloud_API'?whatsAppFields:{}), ...preset?.configuration, ...credential.configuration },
      username: '',
      secret: '',
      webhookRequired: credential.webhookEnabled===true,
      webhookSecret: ''
    } : preset ? { ...blankCredential(), ...preset, protocol: 'HTTPS' } : blankCredential());
  };

  const submit = async () => {
    if (!draft || saving) return;
    setTouched({ name: true, label: true, baseUrl: true });
    if (Object.values(fieldErrors).some(Boolean)) return;
    const existingWebhook=Boolean(credentials.find(item=>item.id===draft.id)?.webhookId);
    if(draft.webhookRequired&&(!existingWebhook&&!draft.webhookSecret||draft.webhookSecret&&draft.webhookSecret.length<16)){
      setError('Enter a webhook signing secret of at least 16 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result=await onSave({
        ...draft,
        name: draft.name.trim(),
        label: draft.label.trim(),
        baseUrl: draft.baseUrl.trim(),
        ...(draft.headerName?.trim() ? { headerName: draft.headerName.trim() } : {}),
        ...(draft.username?.trim() ? { username: draft.username.trim() } : {}),
        ...(draft.secret ? { secret: draft.secret } : {}),
        ...((draft.webhookRequired || existingWebhook)
          ? {webhookRequired:Boolean(draft.webhookRequired)} : {}),
        ...(draft.webhookSecret?{webhookSecret:draft.webhookSecret}:{})
      });
      if(draft.webhookRequired){
        setSavedWebhook({callbackUrl:result.credential.webhookCallbackUrl??'',
          verifyToken:result.webhookVerifyToken});
        setDraft({...draft,id:result.credential.id,webhookSecret:''});
        setViewing(true);
      }else setDraft(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save Named Credential');
    } finally {
      setSaving(false);
    }
  };

  const visibleCredentials = credentials.filter((credential) =>
    `${credential.label} ${credential.name} ${credential.protocol} ${credential.baseUrl}`
      .toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const totalPages = Math.max(1, Math.ceil(visibleCredentials.length / 50));
  const currentPage = Math.min(page, totalPages - 1);
  const pagedCredentials = visibleCredentials.slice(currentPage * 50, (currentPage + 1) * 50);

  const performAction = async (credential: NamedCredentialMetadata, action: 'delete' | 'rotate') => {
    if (busyId) return;
    if (action === 'delete' && !window.confirm(`Delete Named Credential "${credential.label}"? Credentials used by a Flow or other feature cannot be deleted.`)) return;
    setBusyId(credential.id);
    setError('');
    try {
      if (action === 'delete') await onDelete(credential.id);
      else if (onRotate) await onRotate(credential.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `Unable to ${action} Named Credential`);
    } finally {
      setBusyId('');
    }
  };

  const toggleEnabled = async (credential: NamedCredentialMetadata) => {
    if (!onToggleEnabled || toggleBusyId) return;
    setToggleBusyId(credential.id);
    setError('');
    try {
      await onToggleEnabled(credential.id, credential.enabled === false);
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Unable to change connection status');
    } finally {
      setToggleBusyId('');
    }
  };

  const authorizeOAuth=async(credential:NamedCredentialMetadata)=>{
    if(!onOAuthAuthorize||busyId)return;
    setBusyId(credential.id);setError('');
    try{
      const url=await onOAuthAuthorize(credential.id);
      const destination=new URL(url);
      if(destination.protocol!=='https:')throw new Error('Authorization URL must use HTTPS');
      window.location.assign(url);
    }catch(error){setError(error instanceof Error?error.message:'OAuth authorization failed');}
    finally{setBusyId('');}
  };
  const testCredential = async (credential: NamedCredentialMetadata) => {
    if (busyId || !onTest) return;
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
      <div><h1 className="audit-page-heading">{embedded ? 'Connection Settings' : 'Named Credentials'}</h1><p>{embedded ? 'Tenant-specific connection configuration. Secrets remain encrypted and masked.' : 'Manage tenant-wide HTTPS and SMTP credentials used by Flow callouts and delivery features.'}</p></div>
      <button className="btn btn-brand" disabled={!canManage || encryptionReady === false} title={!canManage ? 'Requires namedCredentials:manage permission' : encryptionReady === false ? 'Credential encryption is not configured on the server' : undefined} onClick={() => editCredential()}><Plus size={14} />{embedded ? 'Configure Connection' : 'New Named Credential'}</button>
    </div>
    {!embedded && <div className="record-type-create">
      <input className="form-control" type="search" aria-label="Search Named Credentials" placeholder="Search credentials…" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} />
    </div>}
    {error && <div className="records-message" role="alert">{error}</div>}
    {!canManage && <div className="info-callout" role="alert">This account cannot edit connector configuration. Ask an administrator for connectorApps:edit.</div>}
    {encryptionReady === false && <div className="records-message" role="alert">Credential encryption is not configured on the server. Check METADRIVE_CREDENTIAL_KEYS and METADRIVE_CREDENTIAL_ACTIVE_KEY_ID in the active server environment (or the legacy METADRIVE_CREDENTIAL_ENCRYPTION_KEY). Preserve existing keys when moving between hosting providers.</div>}
    <div className="table-scroll">
      <table className="slds-table">
        <thead><tr><th>Label</th><th>API Name</th><th>Protocol</th><th>Base URL</th><th>Authentication</th><th>Secret</th><th>Updated</th><th>Connection Test</th>{!embedded && <th>Status</th>}<th>Actions</th></tr></thead>
        <tbody>{pagedCredentials.map((credential) => <tr key={credential.id}>
          <td><button className="btn btn-link" onClick={() => editCredential(credential, true)}>{credential.label}</button></td>
          <td>{credential.name}</td>
          <td>{credential.protocol}</td>
          <td>{credential.baseUrl}</td>
          <td>{credential.authType}</td>
          <td>{credential.authType === 'None' ? 'Not required' : credential.hasSecret ? 'Stored · masked' : 'Not configured'}</td>
          <td>{new Date(credential.updatedAt).toLocaleString()}</td>
          <td role="status">{testResults[credential.id] ?? 'Not tested'}</td>
          {!embedded && <td><label className="credential-switch" aria-label={`Connection status for ${credential.label}`}><input type="checkbox" role="switch" checked={credential.enabled !== false} disabled={!canManage || !onToggleEnabled || Boolean(toggleBusyId)} onChange={() => void toggleEnabled(credential)} /><span className="credential-switch-track" aria-hidden="true" /><span>{toggleBusyId === credential.id ? 'Updating…' : credential.enabled === false ? 'Disabled' : 'Enabled'}</span></label></td>}
          <td><div className="toolbar-actions">
            {credential.authType==='OAuth Authorization Code'&&onOAuthAuthorize&&
              <button className="btn btn-small" disabled={!canManage||Boolean(busyId)||credential.enabled===false}
                onClick={()=>void authorizeOAuth(credential)}>Authorize</button>}
            <button className="btn btn-small" aria-label={`Test connection for ${credential.label}`} disabled={!(canTest ?? canManage) || !onTest || credential.enabled === false || Boolean(busyId)} title={credential.protocol === 'SMTP' ? 'Verify SMTP connection, TLS and authentication without sending email' : 'Test saved HTTPS base URL with stored authentication'} onClick={() => void testCredential(credential)}>{busyId === credential.id ? 'Testing…' : 'Test Connection'}</button>
            <button className="icon-button subtle" aria-label={`View ${credential.label}`} onClick={() => editCredential(credential, true)}><Eye size={14} /></button>
            <button className="icon-button subtle" aria-label={`Edit ${credential.label}`} title={!canManage ? 'Manage Named Credentials permission required' : 'Edit credential'} disabled={!canManage || Boolean(busyId)} onClick={() => editCredential(credential)}><Pencil size={14} /></button>
            {onRotate && <button className="icon-button subtle" aria-label={`Rotate key for ${credential.label}`} title="Rotate encryption key" disabled={!canManage || Boolean(busyId)} onClick={() => void performAction(credential, 'rotate')}><RotateCw size={14} /></button>}
            {!embedded && <button className="icon-button subtle" aria-label={`Delete ${credential.label}`} disabled={!canManage || Boolean(busyId)} onClick={() => void performAction(credential, 'delete')}><Trash2 size={14} /></button>}
          </div></td>
        </tr>)}</tbody>
      </table>
    </div>
    {!embedded && <div className="section-toolbar" style={{marginTop:14}}>
      <span>{visibleCredentials.length} credentials · Page {currentPage + 1} of {totalPages}</span>
      <div className="toolbar-actions">
        <button className="btn btn-small" disabled={currentPage === 0} onClick={() => setPage(0)}>First</button>
        <button className="btn btn-small" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
        <button className="btn btn-small" disabled={currentPage + 1 >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</button>
        <button className="btn btn-small" disabled={currentPage + 1 >= totalPages} onClick={() => setPage(totalPages - 1)}>Last</button>
      </div>
    </div>}
    {!visibleCredentials.length && <div className="empty-state">{credentials.length ? 'No Named Credentials match your search.' : 'No Named Credentials are configured yet.'}</div>}
    {draft && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDraft(null); }}>
      <section ref={modalRef} tabIndex={-1} className="modal named-credential-modal" role="dialog" aria-modal="true" aria-labelledby="named-credential-title">
        <div className="modal-header"><h2 id="named-credential-title">{viewing ? 'Connection Details' : draft.id ? 'Edit Connection' : 'Configure Connection'}</h2><button className="icon-button dark" aria-label="Close" disabled={saving} onClick={() => setDraft(null)}><X size={18} /></button></div>
        <p className="modal-copy"><KeyRound size={14} /> Credentials are shared within this tenant. Secrets are encrypted at rest and never displayed after saving.</p>
        <fieldset disabled={viewing} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="named-credential-form-grid">
        <PlatformPageSlot slotKey="field-credentials-01"><label className="form-label">API Name<input className="form-control" autoComplete="off" disabled={Boolean(providerName)} value={draft.name} aria-invalid={Boolean(touched.name && fieldErrors.name)} onBlur={() => blurField('name')} onChange={(event) => updateDraft({ name: event.target.value.replace(/[^A-Za-z0-9_]/g, '') })} placeholder="Partner_API" />{touched.name && fieldErrors.name && <small role="alert" className="field-error">{fieldErrors.name}</small>}</label></PlatformPageSlot>
        <PlatformPageSlot slotKey="field-credentials-02"><label className="form-label">Label<input className="form-control" value={draft.label} aria-invalid={Boolean(touched.label && fieldErrors.label)} onBlur={() => blurField('label')} onChange={(event) => updateDraft({ label: event.target.value })} placeholder="Partner API" />{touched.label && fieldErrors.label && <small role="alert" className="field-error">{fieldErrors.label}</small>}</label></PlatformPageSlot>
        <PlatformPageSlot slotKey="field-credentials-03"><label className="form-label">Protocol<select className="form-control" value={draft.protocol} onChange={(event) => {
          const protocol = event.target.value as NamedCredentialMetadata['protocol'];
          updateDraft({ protocol, authType: protocol === 'SMTP' && !['None', 'Basic'].includes(draft.authType) ? 'Basic' : draft.authType });
        }}><option>HTTPS</option><option>SMTP</option></select></label></PlatformPageSlot>
        <PlatformPageSlot slotKey="field-credentials-04"><label className="form-label">{draft.protocol === 'SMTP' ? 'SMTP Server URL' : 'Base URL'}<input className="form-control" type="url" value={draft.baseUrl} aria-invalid={Boolean(touched.baseUrl && fieldErrors.baseUrl)} onBlur={() => blurField('baseUrl')} onChange={(event) => updateDraft({ baseUrl: event.target.value })} placeholder={draft.protocol === 'SMTP' ? 'smtp://smtp.example.com:587' : 'https://api.example.com/'} />{touched.baseUrl && fieldErrors.baseUrl && <small role="alert" className="field-error">{fieldErrors.baseUrl}</small>}</label></PlatformPageSlot>
        <PlatformPageSlot slotKey="field-credentials-05"><label className="form-label">Authentication<select className="form-control" value={draft.authType} onChange={(event) => {
          const authType = event.target.value as NamedCredentialMetadata['authType'];
          updateDraft({ authType, configuration: ['OAuth Client Credentials','OAuth Authorization Code'].includes(authType)
            ? { clientId: '', ...(authType==='OAuth Authorization Code'?{authorizationUrl:'',tokenUrl:''}:{tokenPath:''}), scope: '', ...draft.configuration }
            : draft.configuration });
        }}>
          {(draft.protocol === 'SMTP' ? ['None', 'Basic'] : ['None', 'Bearer', 'Basic', 'API Key', 'OAuth Client Credentials', 'OAuth Authorization Code']).map((authType) => <option key={authType}>{authType}</option>)}
        </select></label></PlatformPageSlot>
        <fieldset className="connector-config-fields named-credential-span-full" style={{ border: 0, padding: 0, margin: '12px 0' }}>
          <legend>Configuration variables</legend>
          {Object.entries(draft.configuration ?? {}).map(([key, value]) => (
            <label key={key} className="connector-config-row" style={{ display: 'grid', gridTemplateColumns: '40% 1fr', gap: 12, alignItems: 'center', marginBottom: 8 }}>
              <span>{fieldLabels?.[key] || key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ')}</span>
              <input className="form-control" value={value} onChange={(event) => updateDraft({ configuration: { ...draft.configuration, [key]: event.target.value } })} />
            </label>
          ))}
          {!viewing && <button type="button" className="btn btn-small" onClick={() => {
            const key = window.prompt('Variable name (letters, numbers, underscore)');
            if (key && /^[A-Za-z][A-Za-z0-9_]*$/.test(key)) updateDraft({ configuration: { ...draft.configuration, [key]: '' } });
          }}>Add variable</button>}
        </fieldset>
        {['OAuth Client Credentials','OAuth Authorization Code'].includes(draft.authType) && <div className="info-callout named-credential-span-full">Configure clientId and scope. Client Credentials requires tokenPath (relative to Base URL); Authorization Code requires public HTTPS authorizationUrl and tokenUrl. Enter the client secret in the encrypted Secret field. OAuth tokens are protected and never exposed to Flows.</div>}
        {draft.authType === 'API Key' && <PlatformPageSlot slotKey="field-credentials-06"><label className="form-label">API Key Header<input className="form-control" value={draft.headerName ?? ''} onChange={(event) => updateDraft({ headerName: event.target.value })} placeholder="X-API-Key" /></label></PlatformPageSlot>}
        {draft.authType === 'Basic' && canManageSecrets && <PlatformPageSlot slotKey="field-credentials-07"><label className="form-label">Username<input className="form-control" autoComplete="off" value={draft.username ?? ''} onChange={(event) => updateDraft({ username: event.target.value })} placeholder={draft.id ? 'Leave blank to retain' : ''} /></label></PlatformPageSlot>}
        {draft.authType !== 'None' && canManageSecrets && <PlatformPageSlot slotKey="field-credentials-08"><label className="form-label">{draft.authType === 'Basic' ? 'Password' : draft.authType === 'OAuth Client Credentials' ? 'Client Secret' : 'Secret'}<input className="form-control" type="password" autoComplete="new-password" value={draft.secret ?? ''} onChange={(event) => updateDraft({ secret: event.target.value })} placeholder={draft.id ? 'Stored securely · blank keeps existing secret' : 'Enter secret'} /></label></PlatformPageSlot>}
        </div>
        {draft.protocol==='HTTPS' && <div className="named-credential-span-full" style={{marginTop:16}}>
          <label className="credential-switch">
            <input type="checkbox" role="switch" checked={Boolean(draft.webhookRequired)}
              disabled={!canManageSecrets}
              onChange={event=>updateDraft({webhookRequired:event.target.checked,webhookSecret:''})}/>
            <span className="credential-switch-track" aria-hidden="true"/>
            <span>Webhook required?</span>
          </label>
          {draft.webhookRequired && <p className="modal-copy">
            One signed callback is generated automatically for this connection. Incoming events
            are stored in Communication; no Flow assignment is needed.
          </p>}
          {draft.webhookRequired && canManageSecrets && <label className="form-label">
            Webhook signing secret
            <input className="form-control" type="password" autoComplete="new-password"
              minLength={16} maxLength={512} value={draft.webhookSecret??''}
              placeholder={credentials.find(item=>item.id===draft.id)?.webhookId
                ?'Stored securely · leave blank to retain':'Enter provider signing secret'}
              onChange={event=>updateDraft({webhookSecret:event.target.value})}/>
          </label>}
        </div>}
        {draft.id && !embedded && <div className="named-credential-activation"><strong>Connection status</strong><label className="credential-switch"><input type="checkbox" role="switch" checked={credentials.find((item) => item.id === draft.id)?.enabled !== false} disabled={viewing || !canManage || !onToggleEnabled || Boolean(toggleBusyId)} onChange={() => { const credential = credentials.find((item) => item.id === draft.id); if (credential) void toggleEnabled(credential); }} /><span className="credential-switch-track" aria-hidden="true" /><span>{toggleBusyId ? 'Updating…' : credentials.find((item) => item.id === draft.id)?.enabled === false ? 'Disabled' : 'Enabled'}</span></label></div>}
        {draft.id && <div className="info-callout">Leave the secret blank to keep the existing secret. Changing authentication type requires a new secret.</div>}
        {error && <div className="records-message" role="alert">{error}</div>}
        </fieldset>
        {(savedWebhook?.callbackUrl ||
          (draft.webhookRequired && credentials.find(item=>item.id===draft.id)?.webhookCallbackUrl))
          && <div className="info-callout" style={{marginTop:14}}>
            <strong>Webhook callback URL</strong>
            <input className="form-control" readOnly
              value={savedWebhook?.callbackUrl||
                credentials.find(item=>item.id===draft.id)?.webhookCallbackUrl||''}
              onFocus={event=>event.currentTarget.select()}/>
            {savedWebhook?.verifyToken&&<>
              <strong>Verification token (copy now; shown only once)</strong>
              <input className="form-control" readOnly value={savedWebhook.verifyToken}
                onFocus={event=>event.currentTarget.select()}/>
            </>}
            <small>Register the callback and verification token with your provider.
              The signing secret is never displayed after saving.</small>
          </div>}
        <div className="modal-actions"><button className="btn" disabled={saving} onClick={() => setDraft(null)}>{viewing ? 'Close' : 'Cancel'}</button>{!viewing && <button className="btn btn-brand" disabled={saving || !draft.name.trim() || !draft.label.trim() || !draft.baseUrl.trim() || (draft.authType !== 'None' && !draft.id && !draft.secret) || (draft.authType === 'Basic' && !draft.id && !draft.username?.trim())
          ||(draft.webhookRequired&&!credentials.find(item=>item.id===draft.id)?.webhookId
            &&(draft.webhookSecret?.length??0)<16)
          ||Boolean(draft.webhookSecret&&(draft.webhookSecret.length<16||draft.webhookSecret.length>512))} onClick={() => void submit()}>{saving ? 'Saving…' : draft.id ? 'Save Changes' : 'Save Named Credential'}</button>}{viewing && canManage && <button className="btn btn-brand" onClick={() => setViewing(false)}><Pencil size={14} />Edit</button>}</div>
      </section>
    </div>}
  </section>;
}
