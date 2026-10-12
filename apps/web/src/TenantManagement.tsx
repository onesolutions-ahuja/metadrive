import { useEffect, useState, type FormEvent } from 'react';
import { Building2, ChevronLeft, ChevronRight, CircleAlert, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import './TenantManagement.css';

export type TenantSummary = {
  tenantId: string;
  name: string;
  description: string;
  status: 'ACTIVE' | 'SUSPENDED';
  createdAt: string;
  updatedAt: string;
  userCount: number;
  activeUserCount: number;
  provisioning: { status: 'READY'; version: number; completedAt: string };
};

type TenantCreate = {
  tenantId: string; tenantName: string; adminName: string; email: string; password: string;
};
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
const emptyCreate: TenantCreate = { tenantId: '', tenantName: '', adminName: '', email: '', password: '' };
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
        method: 'POST', headers: { 'Idempotency-Key': createKey }, body: JSON.stringify(create)
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
    if (!window.confirm(suspend
      ? `Suspend ${selected.name}? All tenant sessions will be blocked and existing refresh sessions revoked.`
      : `Reactivate ${selected.name}? Users will need to sign in again.`)) return;
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
      <section className="tenant-panel" aria-label="Tenants">
        <div className="tenant-toolbar">
          <label className="tenant-search"><Search size={16} /><input type="search" aria-label="Search tenants" placeholder="Search name or tenant ID" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
          <label className="tenant-filter">Status <select aria-label="Filter tenant status" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ALL">All</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></label>
        </div>
        <div className="tenant-table-wrap"><table className="tenant-table"><thead><tr><th>Name / Tenant ID</th><th>Status</th><th>Users</th><th>Created</th></tr></thead>
          <tbody>{tenants.map((item) => <tr key={item.tenantId} className={selected?.tenantId === item.tenantId ? 'tenant-row-selected' : ''}>
            <td><button className="tenant-name-link" onClick={() => void selectTenant(item.tenantId)}>{item.name}</button><small>{item.tenantId}</small></td>
            <td><span className={item.status === 'ACTIVE' ? 'tenant-pill tenant-pill-active' : 'tenant-pill tenant-pill-suspended'}>{item.status === 'ACTIVE' ? 'Active' : 'Suspended'}</span></td>
            <td>{item.activeUserCount} / {item.userCount}</td><td>{shortDate(item.createdAt)}</td></tr>)}
            {!loading && tenants.length === 0 && <tr><td colSpan={4} className="tenant-empty">No tenants match this search.</td></tr>}
            {loading && <tr><td colSpan={4} className="tenant-empty">Loading tenants…</td></tr>}
          </tbody></table></div>
        <footer className="tenant-pagination"><span>{total} tenant{total === 1 ? '' : 's'} · Page {page} of {Math.max(1, Math.ceil(total / pageSize))}</span><div>
          <button aria-label="Previous tenants" disabled={page === 1 || loading} onClick={() => setPage((n) => Math.max(1, n - 1))}><ChevronLeft size={16} /></button>
          <button aria-label="Next tenants" disabled={page * pageSize >= total || loading} onClick={() => setPage((n) => n + 1)}><ChevronRight size={16} /></button>
        </div></footer>
      </section>
      <section className="tenant-panel tenant-detail" aria-label={showCreate ? 'Create tenant' : 'Tenant details'}>
        {showCreate ? <form onSubmit={(event) => void createTenant(event)}>
          <div className="tenant-detail-heading"><h2>New tenant</h2><button type="button" className="tenant-button" onClick={() => { setShowCreate(false); setCreate(emptyCreate); setCreateKey(crypto.randomUUID()); }}>Cancel</button></div>
          <label>Tenant ID<input required minLength={2} maxLength={63} pattern="[A-Za-z0-9][A-Za-z0-9_-]{1,62}" autoComplete="off" value={create.tenantId} onChange={(event) => { setCreateKey(crypto.randomUUID()); setCreate((old) => ({ ...old, tenantId: event.target.value })); }} /></label>
          <label>Organisation name<input required maxLength={120} value={create.tenantName} onChange={(event) => { setCreateKey(crypto.randomUUID()); setCreate((old) => ({ ...old, tenantName: event.target.value })); }} /></label>
          <label>Initial administrator name<input required maxLength={120} value={create.adminName} onChange={(event) => { setCreateKey(crypto.randomUUID()); setCreate((old) => ({ ...old, adminName: event.target.value })); }} /></label>
          <label>Initial administrator email<input type="email" required maxLength={254} autoComplete="off" value={create.email} onChange={(event) => { setCreateKey(crypto.randomUUID()); setCreate((old) => ({ ...old, email: event.target.value })); }} /></label>
          <label>Initial administrator password<input type="password" required minLength={12} maxLength={256} autoComplete="new-password" value={create.password} onChange={(event) => { setCreateKey(crypto.randomUUID()); setCreate((old) => ({ ...old, password: event.target.value })); }} /></label>
          <p className="tenant-help">Creates tenant records, default objects, profiles and permissions, and an initial administrator in one durable Aiven commit. Safe submission retries will not create duplicate accounts. Never reuse a platform administrator password.</p>
          <button type="submit" className="tenant-button tenant-button-primary" disabled={busy}>{busy ? 'Creating…' : 'Create tenant'}</button>
        </form> : selected ? <form onSubmit={(event) => void saveTenant(event)}>
          <div className="tenant-detail-heading"><div><h2>{selected.name}</h2><code>{selected.tenantId}</code></div><button type="button" className="tenant-button" onClick={() => setSelected(null)}>Close</button></div>
          <p className="tenant-provisioning-status"><span className="tenant-pill tenant-pill-active">Provisioning ready</span> <small>Version {selected.provisioning.version} · {shortDate(selected.provisioning.completedAt)}</small></p>
          <p><span className={selected.status === 'ACTIVE' ? 'tenant-pill tenant-pill-active' : 'tenant-pill tenant-pill-suspended'}>{selected.status === 'ACTIVE' ? 'Active' : 'Suspended'}</span></p>
          <label>Organisation name<input required maxLength={120} value={editing.name} onChange={(event) => setEditing((old) => ({ ...old, name: event.target.value }))} /></label>
          <label>Description<textarea rows={4} maxLength={1000} value={editing.description} onChange={(event) => setEditing((old) => ({ ...old, description: event.target.value }))} /></label>
          <div className="tenant-facts"><span>Created</span><strong>{shortDate(selected.createdAt)}</strong><span>Last updated</span><strong>{shortDate(selected.updatedAt)}</strong><span>Active users</span><strong>{selected.activeUserCount} of {selected.userCount}</strong></div>
          <div className="tenant-actions"><button type="submit" className="tenant-button tenant-button-primary" disabled={busy || !editing.name.trim()}>{busy ? 'Saving…' : 'Save details'}</button>
            <button type="button" className={selected.status === 'ACTIVE' ? 'tenant-button tenant-button-danger' : 'tenant-button'} onClick={() => void changeStatus()} disabled={busy}>{selected.status === 'ACTIVE' ? 'Suspend tenant' : 'Reactivate tenant'}</button></div>
          <p className="tenant-help">Tenant ID cannot be changed. Suspended tenants cannot authenticate or use existing sessions; tenant data is retained.</p>
        </form> : <div className="tenant-placeholder"><Building2 size={30} /><h2>Tenant details</h2><p>Select a tenant to view or edit it, or create a new tenant.</p></div>}
      </section>
    </div>
  </div>;
}
