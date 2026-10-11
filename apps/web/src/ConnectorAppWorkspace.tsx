import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import NamedCredentials from './NamedCredentials';
import type { NamedCredentialMetadata } from './metadata';

export type ConnectorApp = { id: string; name: string; credentialName: string; source: string };
export type CommunicationRow = { Id: string; [key: string]: unknown };
export type CommunicationPage = { records: CommunicationRow[]; total: number };

export default function ConnectorAppWorkspace({
  app, credentials, canManageCredentials, encryptionReady, onBack,
  onSave, onDelete, onRotate, onTest, loadHistory, onOpenRecord
}: {
  app: ConnectorApp;
  credentials: NamedCredentialMetadata[];
  canManageCredentials: boolean;
  encryptionReady: boolean | null;
  onBack: () => void;
  onSave: (value: Parameters<Parameters<typeof NamedCredentials>[0]['onSave']>[0]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRotate: (id: string) => Promise<void>;
  onTest: (id: string) => Promise<{ connected: boolean; status?: number; message: string }>;
  loadHistory: (source: string, offset: number, search: string) => Promise<CommunicationPage>;
  onOpenRecord: (id: string) => void;
}) {
  const [section, setSection] = useState<'credentials' | 'history'>('credentials');
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<CommunicationPage>({ records: [], total: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { setPage(0); setSearch(''); setSection('credentials'); }, [app.id]);
  useEffect(() => {
    if (section !== 'history') return;
    let active = true;
    setLoading(true); setError('');
    void loadHistory(app.source, page * 50, search).then((result) => {
      if (active) setData(result);
    }).catch((reason: unknown) => {
      if (active) { setData({records:[], total:0}); setError(reason instanceof Error ? reason.message : 'Unable to load communication records'); }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [app.source, page, search, section, loadHistory]);
  const matched = credentials.filter((item) => item.name.toUpperCase() === app.credentialName.toUpperCase());
  const columns = [
    ['CreatedDate', 'Date'], ['Communication_Mode__c', 'Mode'], ['Direction__c', 'Direction'],
    ['Recipient__c', 'Recipient'], ['Message_Body__c', 'Message'], ['Status__c', 'Status'], ['Source__c', 'Source']
  ] as const;
  return <div className="app-exchange connector-open-page">
    <div className="exchange-topline"><button className="btn" onClick={onBack}><ArrowLeft size={14}/> AppExchange</button><strong>{app.name}</strong></div>
    <div className="surface" style={{ padding: 18, marginBottom: 16 }}>
      <h2>{app.name}</h2>
      <p>Tenant-scoped settings and communication history. Access is controlled by existing user permissions.</p>
      <div className="exchange-tabs" role="tablist" aria-label={app.name + ' management'}>
        <button role="tab" aria-selected={section === 'credentials'} className={section === 'credentials' ? 'active' : ''} onClick={() => setSection('credentials')}>Named Credentials</button>
        <button role="tab" aria-selected={section === 'history'} className={section === 'history' ? 'active' : ''} onClick={() => setSection('history')}>Communication History</button>
      </div>
    </div>
    {section === 'credentials' ? <NamedCredentials credentials={matched} canManage={canManageCredentials}
      encryptionReady={encryptionReady} onSave={onSave} onDelete={onDelete} onRotate={onRotate} onTest={onTest}
      providerName={app.credentialName} /> :
      <section className="surface" style={{ padding: 18 }}>
        <div className="section-toolbar"><div><h2>Communication History</h2><p>Filtered to {app.name} from the shared Communication Records object.</p></div>
          <button className="btn" onClick={() => setPage(0)} disabled={loading}><RefreshCw size={14}/> Refresh</button></div>
        <input className="form-control" style={{maxWidth:360,marginBottom:14}} type="search" aria-label="Search communication history"
          value={search} placeholder="Search this app's history" onChange={(event) => {setSearch(event.target.value);setPage(0);}} />
        {error && <div className="records-message" role="alert">{error}</div>}
        <div className="table-scroll"><table className="slds-table"><thead><tr>
          {columns.map(([key,label]) => <th key={key}>{label}</th>)}<th>Actions</th>
        </tr></thead><tbody>{data.records.map((record) => <tr key={record.Id}>
          {columns.map(([key]) => <td key={key}>{Object.prototype.hasOwnProperty.call(record,key)
            ? String(record[key] ?? '') : '********'}</td>)}
          <td><button className="btn btn-small" onClick={() => onOpenRecord(record.Id)}>View</button></td>
        </tr>)}</tbody></table></div>
        {!loading && !error && data.records.length === 0 && <div className="empty-state">No matching communication records.</div>}
        <div className="section-toolbar" style={{marginTop:14}}>
          <span>{loading ? 'Loading…' : `${data.total} matching records · 50 per page`}</span>
          <div className="toolbar-actions">
            <button className="btn btn-small" disabled={page === 0 || loading} onClick={() => setPage(0)}>First</button>
            <button className="btn btn-small" disabled={page === 0 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={13}/>Previous</button>
            <span>Page {page + 1}</span>
            <button className="btn btn-small" disabled={loading || (page + 1) * 50 >= data.total} onClick={() => setPage((value) => value + 1)}>Next<ChevronRight size={13}/></button>
            <button className="btn btn-small" disabled={loading || (page + 1) * 50 >= data.total} onClick={() => setPage(Math.max(0, Math.ceil(data.total / 50) - 1))}>Last</button>
          </div>
        </div>
      </section>}
  </div>;
}
