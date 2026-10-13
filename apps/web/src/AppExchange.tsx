import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, ChevronRight, Download, LockKeyhole, PackageCheck, Puzzle, Search, ShieldCheck, X } from 'lucide-react';
import ConnectorAppWorkspace, { appLicensed, type ConnectorApp, type ConnectorFlowSummary, type CommunicationPage, type CredentialInput } from './ConnectorAppWorkspace';
import type { NamedCredentialMetadata } from './metadata';

type Props = {
  credentials: NamedCredentialMetadata[];
  flows: ConnectorFlowSummary[];
  canManageCredentials: boolean;
  canView: boolean;
  canManageSecrets: boolean;
  canTest: boolean;
  canInstall: boolean;
  canLicenceAdmin: boolean;
  canManageFlows: boolean;
  encryptionReady: boolean | null;
  loadApps: () => Promise<ConnectorApp[]>;
  executeLifecycleFlow: (flowName: string, appKey: string) => Promise<void>;
  onSave: (value: CredentialInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRotate: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<{connected: boolean; status?: number; message: string}>;
  onOAuthAuthorize?: (id: string) => Promise<string>;
  onGrantLicence: (appKey: string) => Promise<void>;
  loadHistory: (objectName: string, field: string, source: string, offset: number, search: string) => Promise<CommunicationPage>;
  onOpenRecord: (objectName: string, id: string) => void;
  onOpenFlow: (apiName: string) => void;
};

export default function AppExchange(props: Props) {
  const [apps, setApps] = useState<ConnectorApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All apps');
  const [view, setView] = useState<'discover'|'installed'>('discover');
  const [selected, setSelected] = useState<string | null>(null);
  const [openedKey, setOpenedKey] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const rows = await props.loadApps();
    setApps(rows);
  }, [props.loadApps]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void props.loadApps().then((rows) => { if (active) setApps(rows); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : 'Cannot load connector app metadata'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [props.loadApps]);
  const categories = useMemo(() => ['All apps', ...Array.from(new Set(apps.map((app) => app.Category__c || 'Integrations')))], [apps]);
  const visible = useMemo(() => apps.filter((app) =>
    (view === 'discover' || app.Installed__c) &&
    (category === 'All apps' || (app.Category__c || 'Integrations') === category) &&
    (app.Name + ' ' + (app.Description__c || '') + ' ' + (app.Category__c || '')).toLowerCase().includes(query.trim().toLowerCase())
  ), [apps, view, category, query]);
  const installed = apps.filter((app) => app.Installed__c).length;
  const details = selected ? apps.find((app) => app.AppKey__c === selected) : undefined;
  const opened = openedKey ? apps.find((app) => app.AppKey__c === openedKey) : undefined;

  const action = async (app: ConnectorApp, operation: 'install'|'trial'|'uninstall') => {
    if (busy) return;
    const flowName = operation === 'install' ? app.InstallFlow__c : operation === 'trial' ? app.TrialFlow__c : app.UninstallFlow__c;
    if (!flowName) { setError('This app has no configured ' + operation + ' flow. Update its metadata.'); return; }
    setBusy(true); setError('');
    try {
      await props.executeLifecycleFlow(flowName, app.AppKey__c);
      await refresh();
      setSelected(null);
      if (operation === 'uninstall') setOpenedKey(null);
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Unable to execute connector lifecycle flow');
    } finally { setBusy(false); }
  };

  if (opened) return <ConnectorAppWorkspace app={opened}
    credentials={props.credentials} flows={props.flows} canManageCredentials={props.canManageCredentials}
    canView={props.canView} canManageSecrets={props.canManageSecrets} canTest={props.canTest}
    canInstall={props.canInstall} canLicenceAdmin={props.canLicenceAdmin}
    onGrantLicence={async (key) => { await props.onGrantLicence(key); await refresh(); }}
    canManageFlows={props.canManageFlows} encryptionReady={props.encryptionReady}
    onSave={props.onSave} onDelete={props.onDelete} onRotate={props.onRotate} onTest={props.onTest} onOAuthAuthorize={props.onOAuthAuthorize}
    loadHistory={props.loadHistory} onOpenRecord={props.onOpenRecord} onOpenFlow={props.onOpenFlow}
    onLifecycle={(app, operation) => action(app, operation)}
    onBack={() => {setOpenedKey(null);void refresh().catch(()=>{});}}/>;

  return <div className="app-exchange">
    <div className="exchange-topline">
      <div className="exchange-breadcrumb"><span>Setup</span><ChevronRight size={13}/><strong>AppExchange</strong></div>
      <span className="exchange-preview-label"><BadgeCheck size={13}/> Tenant-scoped metadata</span>
    </div>
    <section className="exchange-hero">
      <div className="exchange-hero-copy">
        <div className="exchange-eyebrow"><Puzzle size={13}/> CONNECTOR APP MARKETPLACE</div>
        <h1>Connect your business apps</h1>
        <p>Install connector apps, activate your 21-day trial, and configure secure connections. Installation does not start the trial.</p>
        <label className="exchange-search"><Search size={17}/>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search connector apps" aria-label="Search AppExchange"/>
          {query && <button onClick={() => setQuery('')} aria-label="Clear search"><X size={14}/></button>}
        </label>
      </div>
    </section>
    <div className="exchange-content">
      {error && <div className="records-message" role="alert">{error}</div>}
      <div className="exchange-tabs" role="tablist" aria-label="Marketplace views">
        <button role="tab" aria-selected={view === 'discover'} className={view === 'discover' ? 'active' : ''} onClick={() => setView('discover')}>Discover apps</button>
        <button role="tab" aria-selected={view === 'installed'} className={view === 'installed' ? 'active' : ''} onClick={() => setView('installed')}>Installed apps <span>{installed}</span></button>
      </div>
      <div className="exchange-section-heading"><div><h2>{view === 'installed' ? 'Installed connector apps' : 'Available connectors'}</h2>
        <p>App definitions, installation status and licence data come from Connector App records.</p></div>
        <div className="exchange-trust-note"><ShieldCheck size={16}/> Permission-aware setup</div>
      </div>
      <div className="exchange-category-row" aria-label="Filter by category">
        {categories.map((name) => <button key={name} className={category === name ? 'active' : ''} onClick={() => setCategory(name)}>{name}</button>)}
      </div>
      {loading && <div className="records-loading">Loading connector app metadata…</div>}
      <div className="exchange-app-grid">
        {visible.map((app) => <article className="exchange-app-card" key={app.AppKey__c}>
          <div className="exchange-card-top">
            <span className="exchange-app-mark teal"><Puzzle size={23}/></span>
            <span className={app.Installed__c ? 'exchange-installed-tag' : 'exchange-price'}>{app.Installed__c ? 'Installed' : 'Connector'}</span>
          </div>
          <button className="exchange-card-info" onClick={() => setSelected(app.AppKey__c)}>
            <strong>{app.Name}</strong><span>Tenant connector <BadgeCheck size={12}/></span>
            <p>{app.Description__c || 'Configurable metadata-driven API connector'}</p>
          </button>
          <div className="exchange-card-meta"><span>{app.Category__c || 'Integrations'}</span>
            <span>{app.Installed__c ? (appLicensed(app) ? 'Licence active' : app.TrialUsed__c ? 'Expired' : 'Trial available') : 'Not installed'}</span></div>
          <div className="exchange-card-footer">
            <span className="exchange-category-label">{app.Category__c || 'Connector'}</span>
            {app.Installed__c
              ? <button className="btn btn-small btn-brand" onClick={() => setOpenedKey(app.AppKey__c)}>Open <ArrowRight size={13}/></button>
              : <button className="btn btn-brand btn-small" onClick={() => setSelected(app.AppKey__c)}>Install <Download size={13}/></button>}
          </div>
        </article>)}
      </div>
      {!loading && !visible.length && <div className="exchange-empty"><strong>No matching connector apps.</strong>
        <p>Check metadata permissions or adjust search filters.</p></div>}
      <div className="exchange-safe-note"><LockKeyhole size={15}/> Uninstall disables callouts but preserves saved credentials and app records.</div>
    </div>
    {details && <div className="exchange-backdrop" role="presentation" onMouseDown={(event) => {if (event.target === event.currentTarget) setSelected(null);}}>
      <section className="exchange-detail" role="dialog" aria-modal="true" aria-labelledby="app-detail-title">
        <button className="exchange-close" aria-label="Close" onClick={() => setSelected(null)}><X size={18}/></button>
        <div className="exchange-detail-head"><span className="exchange-app-mark green"><Puzzle size={25}/></span>
          <div><div className="exchange-detail-category">{details.Category__c || 'Connector'}</div>
            <h2 id="app-detail-title">{details.Name}</h2><div className="exchange-detail-publisher">Configured through metadata and Flows</div></div></div>
        <p className="exchange-detail-description">{details.Description__c}</p>
        <div className="exchange-detail-columns">
          <div><h3>Includes</h3><p>Settings, connection testing, app-filtered records, Flow dependencies and licence management.</p></div>
          <div><h3>Access</h3><p>Uses existing object, field and Named Credential permissions within this tenant.</p></div>
        </div>
        <div className="exchange-data-note"><ShieldCheck size={15}/><span>Trial starts only when you press Start Trial. Reinstallation never resets a previous trial.</span></div>
        {!details.Installed__c && <div className="exchange-data-note"><LockKeyhole size={15}/>
          <span>Access is granted through user profiles and permission sets. Installation does not grant credentials access to every user.</span>
        </div>}
        <div className="exchange-detail-footer"><span><PackageCheck size={14}/> Connector</span>
          {details.Installed__c
            ? <button className="btn btn-brand" onClick={() => {setOpenedKey(details.AppKey__c);setSelected(null);}}>Open</button>
            : <button className="btn btn-brand" disabled={busy || !props.canInstall} onClick={() => void action(details,'install')}>
                {busy ? 'Installing…' : 'Confirm install'} <ArrowRight size={14}/></button>}
        </div>
      </section>
    </div>}
  </div>;
}
