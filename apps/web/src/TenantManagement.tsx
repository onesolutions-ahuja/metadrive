import { useEffect, useState, type FormEvent } from 'react';
import { Building2, ChevronLeft, ChevronRight, CircleAlert, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import './TenantManagement.css';
import {tenantCreateFieldDefinitions} from './adminTenantFieldMetadata';
import AdminPropertyControl from './AdminPropertyControl';
import TenantDomains from './TenantDomains';
import TenantRecoveryPanel from './TenantRecoveryPanel';
import TenantUsagePanel from './TenantUsagePanel';
import {PlatformPageSlot} from './PlatformPageSlot';

export type TenantSummary = {
  tenantId: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'ARCHIVED';
  archivedAt?: string | null; retentionUntil?: string | null; legalHold?: boolean;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  activeUserCount: number;
  provisioning: { status: 'READY'; version: number; completedAt: string };
  developerAccount: { email: string; activated: boolean } | null;
};

type TenantCreate = {
  tenantId: string; tenantName: string; adminName: string; email: string; password: string; developerDomain?: string;
};
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
const emptyCreate: TenantCreate = { tenantId: '', tenantName: '', adminName: '', email: '', password: '', developerDomain: '' };
const shortDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleDateString();
};

export default function TenantManagement({ request, permitted }: { request: Request; permitted: boolean }) {
  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<TenantSummary | null>(null);
  const [editing, setEditing] = useState({ name: '', description: '' });
  const [create, setCreate] = useState<TenantCreate>(emptyCreate);
  const [createKey, setCreateKey] = useState(() => crypto.randomUUID());
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [retentionUntil, setRetentionUntil] = useState('');
  const [legalHold, setLegalHold] = useState(false);
  const pageSize = 25;

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(id);
  }, [query]);
  useEffect(() => {
    if (!permitted) return;
    let cancelled = false;
    setLoading(true);
    request<{ tenants: TenantSummary[]; total: number }>(
      '/platform/tenants?' + new URLSearchParams({
        q: debouncedQuery, status, page: String(page), pageSize: String(pageSize)
      }).toString()
    ).then((result) => {
      if (cancelled) return;
      setTenants(result.tenants);
      setTotal(result.total);
      setError('');
    }).catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load tenants');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [permitted, request, debouncedQuery, status, page, revision]);

  const selectTenant = async (id: string) => {
    setError('');
    try {
      const result = await request<{ tenant: TenantSummary }>('/platform/tenants/' + encodeURIComponent(id));
      setSelected(result.tenant);
      setRetentionUntil(result.tenant.retentionUntil?.slice(0, 10) ?? '');
      setLegalHold(result.tenant.legalHold ?? false);
      setEditing({ name: result.tenant.name, description: result.tenant.description });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to open tenant');
    }
  };
  const createTenant = async (event: FormEvent) => {
    event.preventDefault();
    if (!permitted || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<{ tenant: TenantSummary; replayed: boolean }>('/platform/tenants', {
        method: 'POST', headers: { 'Idempotency-Key': createKey },
        body: JSON.stringify({ ...create, developerDomain: create.developerDomain?.trim() || undefined })
      });
      setShowCreate(false); setCreate(emptyCreate); setCreateKey(crypto.randomUUID());
      setSelected(result.tenant);
      setEditing({ name: result.tenant.name, description: result.tenant.description });
      setNotice(result.replayed ? 'Existing provisioning request confirmed; no duplicate tenant or account was created.' : 'Tenant provisioned and saved successfully.');
      setPage(1); setRevision((n) => n + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create tenant');
    } finally { setBusy(false); }
  };
  const saveTenant = async (event: FormEvent) => {
    event.preventDefault();
    if (!selected || busy || !permitted) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<{ tenant: TenantSummary }>(
        '/platform/tenants/' + encodeURIComponent(selected.tenantId), {
          method: 'PATCH', body: JSON.stringify(editing)
        });
      setSelected(result.tenant); setEditing({ name: result.tenant.name, description: result.tenant.description });
      setNotice('Tenant details saved.'); setRevision((n) => n + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save tenant');
    } finally { setBusy(false); }
  };
  const changeStatus = async () => {
    if (!selected || busy || !permitted) return;
    const suspend = selected.status === 'ACTIVE';
    // Require the immutable tenant ID, not its editable display name, before
    // an operator can change the authentication availability of an organisation.
    // This UI safeguard complements (and never replaces) server-side platform RBAC.
    const confirmation = window.prompt(
      (suspend
        ? `Suspend ${selected.name}? All tenant sessions will be blocked and existing refresh sessions revoked.`
        : `Reactivate ${selected.name}? Users will need to sign in again.`) +
      `\n\nEnter tenant ID "${selected.tenantId}" to confirm:`
    );
    if (confirmation !== selected.tenantId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<{ tenant: TenantSummary }>(
        '/platform/tenants/' + encodeURIComponent(selected.tenantId) + (suspend ? '/suspend' : '/reactivate'),
        { method: 'POST', body: '{}' }
      );
      setSelected(result.tenant);
      setNotice(suspend ? 'Tenant suspended.' : 'Tenant reactivated.');
      setRevision((n) => n + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change tenant status');
    } finally { setBusy(false); }
  };

  const changeLifecycle = async (operation: 'archive' | 'restore') => {
    if (!selected || busy || !permitted) return;
    if (window.prompt(`Enter tenant ID "${selected.tenantId}" to ${operation} this tenant:`) !== selected.tenantId) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<{ tenant: TenantSummary }>(
        '/platform/tenants/' + encodeURIComponent(selected.tenantId) + '/' + operation,
        { method: 'POST', body: '{}' }
      );
      setSelected(result.tenant); setRevision((n) => n + 1);
      setNotice(operation === 'archive' ? 'Tenant archived; data retained and authentication blocked.' :
        'Tenant restored to suspended. Reactivation requires a separate action.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to change lifecycle');
    } finally { setBusy(false); }
  };
  const saveRetention = async () => {
    if (!selected || busy || !permitted) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await request<{ tenant: TenantSummary }>(
        '/platform/tenants/' + encodeURIComponent(selected.tenantId) + '/retention', {
          method: 'PATCH',
          body: JSON.stringify({ retentionUntil: retentionUntil ? new Date(retentionUntil + 'T23:59:59.000Z').toISOString() : null, legalHold })
        });
      setSelected(result.tenant); setRevision((n) => n + 1);
      setNotice('Tenant retention settings saved and audited; no data deleted.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save retention settings');
    } finally { setBusy(false); }
  };

  if (!permitted) return <section className="tenant-console tenant-restricted" role="status">
    <ShieldCheck size={24} />
    <h2>Platform administration only</h2>
    <p>Only users with the platform superadministrator policy can manage tenants.</p>
  </section>;

  return <div className="tenant-console">
    <header className="tenant-heading">
      <div><div className="tenant-eyebrow"><Building2 size={14} /> Platform administration</div>
        <h1>Tenant Management</h1><p>Create, search and manage tenant organisations.</p></div>
      <div className="tenant-header-actions">
        <button type="button" className="tenant-button" onClick={() => setRevision((n) => n + 1)} disabled={loading || busy}><RefreshCw size={16} /> Refresh</button>
        <button type="button" className="tenant-button tenant-button-primary" onClick={() => { setCreate(emptyCreate); setCreateKey(crypto.randomUUID()); setShowCreate(true); setSelected(null); setError(''); }}><Plus size={16} /> New tenant</button>
      </div>
    </header>
    {error && <div className="tenant-alert tenant-alert-error" role="alert"><CircleAlert size={17} /> {error}</div>}
    {notice && <div className="tenant-alert" role="status">{notice}</div>}
    <div className="tenant-columns">
      <PlatformPageSlot slotKey="directory"><section className="tenant-panel" aria-label="Tenants">
        <div className="tenant-toolbar">
          <label className="tenant-search"><Search size={16} /><input type="search" aria-label="Search tenants" placeholder="Search name or tenant ID" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
          <label className="tenant-filter">Status <select aria-label="Filter tenant status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ALL">All</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="ARCHIVED">Archived</option></select></label>
        </div>
        <div className="tenant-table-wrap"><table className="tenant-table"><thead><tr><th>Name / Tenant ID</th><th>Status</th><th>Users</th><th>Created</th></tr></thead>
          <tbody>{tenants.map((item) => <tr key={item.tenantId} className={selected?.tenantId === item.tenantId ? 'tenant-row-selected' : ''}>
            <td><button className="tenant-name-link" onClick={() => void selectTenant(item.tenantId)}>{item.name}</button><small>{item.tenantId}</small></td>
            <td><span className={item.status === 'ACTIVE' ? 'tenant-pill tenant-pill-active' : 'tenant-pill tenant-pill-suspended'}>{item.status === 'ACTIVE' ? 'Active' : item.status === 'ARCHIVED' ? 'Archived' : 'Suspended'}</span></td>
            <td>{item.activeUserCount} / {item.userCount}</td><td>{shortDate(item.createdAt)}</td></tr>)}
            {!loading && tenants.length === 0 && <tr><td colSpan={4} className="tenant-empty">No tenants match this search.</td></tr>}
            {loading && <tr><td colSpan={4} className="tenant-empty">Loading tenants…</td></tr>}
          </tbody></table></div>
        <footer className="tenant-pagination"><span>{total} tenant{total === 1 ? '' : 's'} · Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span><div>
          <button aria-label="Previous tenants" disabled={page === 1 || loading} onClick={() => setPage((n) => Math.max(1, n - 1))}><ChevronLeft size={16} /></button>
          <button aria-label="Next tenants" disabled={page * pageSize >= total || loading} onClick={() => setPage((n) => n + 1)}><ChevronRight size={16} /></button>
        </div></footer>
      </section></PlatformPageSlot>
      <PlatformPageSlot slotKey="tenant-details"><section className="tenant-panel tenant-detail" aria-label={showCreate ? 'Create tenant' : 'Tenant details'}>
        {showCreate ? <form onSubmit={(event) => void createTenant(event)}>
          <div className="tenant-detail-heading"><h2>New tenant</h2><button type="button" className="tenant-button" onClick={() => { setShowCreate(false); setCreate(emptyCreate); setCreateKey(crypto.randomUUID()); }}>Cancel</button></div>
          {tenantCreateFieldDefinitions.map(field=><AdminPropertyControl
            key={field.key} definition={{...field,propertyKey:field.key,kind:'TEXT'}}
            value={create[field.key]??''}
            onChange={value=>{setCreateKey(crypto.randomUUID());setCreate(old=>({...old,[field.key]:value}));}}/>)}
          <p className="tenant-help">Creates an initial administrator and a disabled developer account with full starting tenant permissions. For <strong>developer@tenant-domain.com</strong>, enter tenant-domain.com. The tenant administrator activates the developer account from Company Settings; no password is shared with platform operators.</p>
          <button type="submit" className="tenant-button tenant-button-primary" disabled={busy}>{busy ? 'Creating…' : 'Create tenant'}</button>
        </form> : selected ? <><form onSubmit={(event) => void saveTenant(event)}>
          <div className="tenant-detail-heading"><div><h2>{selected.name}</h2><code>{selected.tenantId}</code></div><button type="button" className="tenant-button" onClick={() => setSelected(null)}>Close</button></div>
          <p className="tenant-provisioning-status"><span className="tenant-pill tenant-pill-active">Provisioning ready</span> <small>Version {selected.provisioning.version} · {shortDate(selected.provisioning.completedAt)}</small></p>
          {selected.developerAccount && <p className="tenant-help">Developer seeder: <strong>{selected.developerAccount.email}</strong> — {selected.developerAccount.activated ? 'Tenant activated' : 'Pending tenant activation'}. The tenant owns all access changes.</p>}
          <p><span className={selected.status === 'ACTIVE' ? 'tenant-pill tenant-pill-active' : 'tenant-pill tenant-pill-suspended'}>{selected.status === 'ACTIVE' ? 'Active' : selected.status === 'ARCHIVED' ? 'Archived' : 'Suspended'}</span></p>
          <label>Organisation name<input required maxLength={120} value={editing.name} onChange={(event) => setEditing((old) => ({ ...old, name: event.target.value }))} /></label>
          <label>Description<textarea rows={4} maxLength={1000} value={editing.description} onChange={(event) => setEditing((old) => ({ ...old, description: event.target.value }))} /></label>
          <div className="tenant-facts"><span>Created</span><strong>{shortDate(selected.createdAt)}</strong><span>Last updated</span><strong>{shortDate(selected.updatedAt)}</strong><span>Active users</span><strong>{selected.activeUserCount} of {selected.userCount}</strong></div>
          <div className="tenant-actions"><button type="submit" className="tenant-button tenant-button-primary" disabled={busy || !editing.name.trim()}>{busy ? 'Saving…' : 'Save details'}</button>
            {selected.status !== 'ARCHIVED' && <button type="button" className={selected.status === 'ACTIVE' ? 'tenant-button tenant-button-danger' : 'tenant-button'} onClick={() => void changeStatus()} disabled={busy}>{selected.status === 'ACTIVE' ? 'Suspend tenant' : 'Reactivate tenant'}</button>}
            {selected.status === 'SUSPENDED' && <button type="button" className="tenant-button tenant-button-danger" onClick={() => void changeLifecycle('archive')} disabled={busy}>Archive tenant</button>}
            {selected.status === 'ARCHIVED' && <button type="button" className="tenant-button" onClick={() => void changeLifecycle('restore')} disabled={busy}>Restore to suspended</button>}</div>
          <p className="tenant-help">Tenant ID cannot be changed. Suspended and archived tenants cannot authenticate; reactivation never restores revoked sessions. Archival retains tenant data.</p>
          <section aria-label="Retention controls">
            <h3>Retention and legal hold</h3>
            <label>Retention until (optional)<input type="date" value={retentionUntil} onChange={(event) => setRetentionUntil(event.target.value)} /></label>
            <label><input type="checkbox" checked={legalHold} onChange={(event) => setLegalHold(event.target.checked)} /> Legal hold</label>
            <button type="button" className="tenant-button" onClick={() => void saveRetention()} disabled={busy}>Save retention policy</button>
            <p className="tenant-help">Retention metadata is audited. No automatic or manual data deletion is enabled.</p>
          </section>
        </form><PlatformPageSlot slotKey="tenant-usage"><TenantUsagePanel request={request} tenantId={selected.tenantId} permitted={permitted} /></PlatformPageSlot><PlatformPageSlot slotKey="tenant-domains"><TenantDomains request={request} permitted={permitted} tenantId={selected.tenantId} /></PlatformPageSlot><PlatformPageSlot slotKey="tenant-recovery"><TenantRecoveryPanel request={request} operator permitted={permitted} tenantId={selected.tenantId} /></PlatformPageSlot></> : <div className="tenant-placeholder"><Building2 size={30} /><h2>Tenant details</h2><p>Select a tenant to view or edit it, or create a new tenant.</p></div>}
      </section></PlatformPageSlot>
    </div>
  </div>;
}
