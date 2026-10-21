import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Building2, ChevronRight, Database, LockKeyhole, Search, Settings2, Workflow, ChartNoAxesColumn, Plug, X, ShieldCheck } from 'lucide-react';
import { setupNavigation } from '../metadata/Definitions/metadata';
import './MobileSettingsHome.css';

type Rights = {
  viewMetadata: boolean;
  editMetadata: boolean;
  viewSecurity: boolean;
  manageSecurity: boolean;
  manageFlows: boolean;
  manageTenants: boolean;
  namedDevices: boolean;
};
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;
type Group = {group: string; items: string[]};
const groupIcons: Record<string, ComponentType<{size?: number; 'aria-hidden'?: boolean}>> = {
  'Platform Administration': ShieldCheck,
  'Company Settings': Building2,
  'Platform Tools': Database,
  'Integrations': Plug,
  'Automation': Workflow,
  'Analytics': ChartNoAxesColumn,
  'Security': LockKeyhole
};
const groupColours: Record<string, string> = {
  'Platform Administration': 'slate',
  'Company Settings': 'blue',
  'Platform Tools': 'purple',
  'Integrations': 'cyan',
  'Automation': 'orange',
  'Analytics': 'green',
  'Security': 'indigo'
};

/** Navigation only: reuse the Setup registry and existing routes; APIs remain the RBAC authority. */
export default function MobileSettingsHome({rights, request, loading, onOpen}:{
  rights: Rights;
  request: Request;
  loading: boolean;
  onOpen: (label: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [credentialAccess, setCredentialAccess] = useState(false);
  useEffect(() => {
    if (!rights.viewMetadata) return;
    let current = true;
    // Check the optional integration permissions only when Settings is opened.
    void Promise.allSettled([
      request<{canManage: boolean}>('/named-credentials/readiness'),
      request<{view: boolean}>('/connector-apps/capabilities')
    ]).then(([credentials, connectors]) => {
      if (current) setCredentialAccess(
        (credentials.status === 'fulfilled' && credentials.value.canManage) ||
        (connectors.status === 'fulfilled' && connectors.value.view)
      );
    });
    return () => { current = false; };
  }, [request, rights.viewMetadata]);

  const sections = useMemo(() => {
    const allowed = (label: string, group: string): boolean => {
      if (label === 'Setup Home') return false;
      if (label === 'Tenant Management') return rights.manageTenants || rights.viewMetadata;
      if (label === 'Named Devices') return rights.namedDevices;
      if (label === 'Named Credentials') return credentialAccess;
      if (group === 'Security') return rights.viewSecurity;
      if (group === 'Automation') return rights.viewMetadata || rights.manageFlows;
      return rights.viewMetadata;
    };
    const normalized = query.trim().toLocaleLowerCase();
    return (setupNavigation as Group[]).map(({group, items}) => ({
      group,
      items: items.filter(item => allowed(item, group) &&
        (!normalized || (item + ' ' + group).toLocaleLowerCase().includes(normalized)))
    })).filter(section => section.items.length);
  }, [query, rights, credentialAccess]);

  return <div className="mobile-settings-home" aria-label="Mobile Settings">
    <div className="mobile-settings-title">
      <span className="mobile-settings-brand"><Settings2 size={20} aria-hidden="true" /> MetaDrive</span>
      <h1>Settings</h1>
      <p>Manage your organisation and apps</p>
    </div>
    <label className="mobile-settings-search">
      <Search size={19} aria-hidden="true" />
      <input type="search" aria-label="Search settings" placeholder="Search settings" value={query}
        onChange={event => setQuery(event.target.value)} />
      {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')}><X size={16} /></button>}
    </label>
    {loading ? <p className="mobile-settings-empty" role="status">Loading permitted settings…</p> :
      sections.length === 0 ? <p className="mobile-settings-empty">No settings available for your access or search.</p> :
        <div className="mobile-settings-groups">{sections.map(({group, items}) => {
          const Icon = groupIcons[group] ?? Settings2;
          return <section key={group} className="mobile-settings-group" aria-label={group}>
            <h2>{group}</h2>
            <div className="mobile-settings-list">
              {items.map(label => <button key={label} type="button" className="mobile-settings-item"
                onClick={() => onOpen(label)}>
                <span className={'mobile-settings-icon mobile-settings-icon-' + (groupColours[group] ?? 'blue')}>
                  <Icon size={18} aria-hidden={true} />
                </span>
                <span className="mobile-settings-item-label">{label === 'Tenant Management' && !rights.manageTenants ? 'My Tenant Management' : label}</span>
                <ChevronRight size={17} aria-hidden="true" className="mobile-settings-chevron" />
              </button>)}
            </div>
          </section>;
        })}</div>}
  </div>;
}
