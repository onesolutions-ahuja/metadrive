import { useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Boxes,
  Check,
  CheckCircle2,
  ChevronRight,
  Cloud,
  Database,
  Download,
  ExternalLink,
  FileText,
  LockKeyhole,
  PackageCheck,
  Puzzle,
  Search,
  ShieldCheck,
  Star,
  Users,
  X
} from 'lucide-react';

type MarketplaceApp = {
  id: string;
  name: string;
  publisher: string;
  description: string;
  category: string;
  rating: string;
  reviews: string;
  installs: string;
  price: string;
  version: string;
  icon: typeof Activity;
  color: string;
  featured?: boolean;
  highlights: string[];
  permissions: string[];
  dataFootprint: string;
};

const marketplaceApps: MarketplaceApp[] = [
  {
    id: 'insight-board',
    name: 'Insight Board',
    publisher: 'Northstar Labs',
    description: 'Bring pipeline health and team performance into one clear, shareable view.',
    category: 'Analytics',
    rating: '4.9',
    reviews: '128',
    installs: '12.4k',
    price: 'Free',
    version: '2.4.1',
    icon: BarChart3,
    color: 'violet',
    featured: true,
    highlights: ['Ready-to-use sales dashboards', 'Filter by owner, team, and date', 'Permission-aware record summaries'],
    permissions: ['Read access to Opportunity and Account', 'Create dashboards and dashboard components'],
    dataFootprint: 'Adds dashboard metadata only. Existing records are not changed.',
  },
  {
    id: 'signflow',
    name: 'SignFlow',
    publisher: 'Papertrail Software',
    description: 'Prepare, send, and track agreements alongside the customer records you already manage.',
    category: 'Productivity',
    rating: '4.8',
    reviews: '96',
    installs: '8.1k',
    price: 'Paid plan',
    version: '1.8.0',
    icon: FileText,
    color: 'blue',
    featured: true,
    highlights: ['Agreement status overview', 'Reusable document templates', 'Flow-ready status updates'],
    permissions: ['Read and edit selected Account and Contact fields', 'Create agreement status metadata'],
    dataFootprint: 'Creates app metadata. Customer records and existing files are retained.',
  },
  {
    id: 'service-pulse',
    name: 'Service Pulse',
    publisher: 'Brightpath Studio',
    description: 'Give service teams a focused workspace for case volume, priority, and response trends.',
    category: 'Service',
    rating: '4.7',
    reviews: '74',
    installs: '6.3k',
    price: 'Free',
    version: '3.1.2',
    icon: Activity,
    color: 'teal',
    highlights: ['Case workload dashboard', 'Priority and status breakdowns', 'Service team home page'],
    permissions: ['Read access to Case and Account', 'Create app page and dashboard metadata'],
    dataFootprint: 'Adds app metadata only. Existing cases and customer data stay in place.',
  },
  {
    id: 'secure-share',
    name: 'Secure Share',
    publisher: 'Pinecone Security',
    description: 'Review sharing posture and make access changes easier to understand.',
    category: 'Security',
    rating: '4.9',
    reviews: '51',
    installs: '4.7k',
    price: 'Free',
    version: '1.2.5',
    icon: ShieldCheck,
    color: 'green',
    highlights: ['Permission review checklist', 'Access change summary', 'Admin-focused guided setup'],
    permissions: ['Read access to users and permission metadata', 'No record write permissions requested'],
    dataFootprint: 'Adds security review metadata. It does not delete or rewrite records.',
  },
  {
    id: 'customer-connect',
    name: 'Customer Connect',
    publisher: 'Fieldnote Works',
    description: 'Coordinate customer handoffs with a shared timeline for sales and success teams.',
    category: 'Sales',
    rating: '4.6',
    reviews: '89',
    installs: '5.9k',
    price: 'Free',
    version: '2.0.3',
    icon: Users,
    color: 'orange',
    highlights: ['Account handoff checklist', 'Relationship timeline panel', 'Team-level activity summary'],
    permissions: ['Read access to Account and Contact', 'Create app page metadata'],
    dataFootprint: 'Adds app and page metadata. Existing customer records are retained.',
  },
  {
    id: 'data-bridge',
    name: 'Data Bridge',
    publisher: 'Cedar Cloud',
    description: 'Monitor connected data jobs and spot sync issues from a single admin panel.',
    category: 'Productivity',
    rating: '4.5',
    reviews: '43',
    installs: '3.2k',
    price: 'Paid plan',
    version: '1.5.0',
    icon: Cloud,
    color: 'slate',
    highlights: ['Connection health overview', 'Sync run history', 'Configurable admin notifications'],
    permissions: ['Read access to selected metadata', 'Create named-credential reference metadata'],
    dataFootprint: 'Adds connection configuration metadata. Existing records are not removed.',
  }
];

const categories = ['All apps', 'Sales', 'Service', 'Analytics', 'Productivity', 'Security'];
type DialogState = { kind: 'install' | 'uninstall'; app: MarketplaceApp } | null;

export default function AppExchange() {
  const [installedIds, setInstalledIds] = useState(() => new Set(['insight-board', 'service-pulse']));
  const [activeCategory, setActiveCategory] = useState('All apps');
  const [activeView, setActiveView] = useState<'discover' | 'installed'>('discover');
  const [search, setSearch] = useState('');
  const [selectedApp, setSelectedApp] = useState<MarketplaceApp | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [installScope, setInstallScope] = useState<'admins' | 'all-users'>('admins');

  const visibleApps = useMemo(() => {
    const query = search.trim().toLowerCase();
    return marketplaceApps.filter((app) => {
      const matchesView = activeView === 'discover' || installedIds.has(app.id);
      const matchesCategory = activeCategory === 'All apps' || app.category === activeCategory;
      const matchesQuery = !query || `${app.name} ${app.publisher} ${app.description} ${app.category}`.toLowerCase().includes(query);
      const featuredAlreadyShown = activeView === 'discover' && activeCategory === 'All apps' && !query && app.featured;
      return matchesView && matchesCategory && matchesQuery && !featuredAlreadyShown;
    });
  }, [activeCategory, activeView, installedIds, search]);

  const requestInstall = (app: MarketplaceApp) => {
    if (!installedIds.has(app.id)) {
      setInstallScope('admins');
      setDialog({ kind: 'install', app });
    }
  };

  const confirmInstall = () => {
    if (!dialog || dialog.kind !== 'install' || installedIds.has(dialog.app.id)) return;
    setInstalledIds((current) => new Set(current).add(dialog.app.id));
    setDialog(null);
    setSelectedApp(null);
  };

  const confirmUninstall = () => {
    if (!dialog || dialog.kind !== 'uninstall' || !installedIds.has(dialog.app.id)) return;
    setInstalledIds((current) => {
      const next = new Set(current);
      next.delete(dialog.app.id);
      return next;
    });
    setDialog(null);
    setSelectedApp(null);
  };

  return (
    <div className="app-exchange">
      <div className="exchange-topline">
        <div className="exchange-breadcrumb"><span>Setup</span><ChevronRight size={13} /><strong>AppExchange</strong></div>
        <span className="exchange-preview-label"><span /> UI preview · changes are not saved</span>
      </div>

      <section className="exchange-hero">
        <div className="exchange-hero-copy">
          <div className="exchange-eyebrow"><Puzzle size={13} /> UNEENGINE APP MARKETPLACE</div>
          <h1>Find the right apps for your team</h1>
          <p>Discover trusted extensions that work with your metadata-driven workspace.</p>
          <label className="exchange-search">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search apps, publishers, or categories" aria-label="Search marketplace apps" />
            {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}
          </label>
        </div>
        <div className="exchange-hero-art" aria-hidden="true">
          <div className="exchange-orbit exchange-orbit-one" />
          <div className="exchange-orbit exchange-orbit-two" />
          <span className="exchange-art-tile exchange-art-main"><Boxes size={34} /></span>
          <span className="exchange-art-tile exchange-art-small"><Puzzle size={18} /></span>
          <span className="exchange-art-tile exchange-art-check"><Check size={16} /></span>
        </div>
      </section>

      <div className="exchange-content">
        <div className="exchange-tabs" role="tablist" aria-label="Marketplace views">
          <button className={activeView === 'discover' ? 'active' : ''} role="tab" aria-selected={activeView === 'discover'} onClick={() => setActiveView('discover')}>Discover apps</button>
          <button className={activeView === 'installed' ? 'active' : ''} role="tab" aria-selected={activeView === 'installed'} onClick={() => setActiveView('installed')}>Installed apps <span>{installedIds.size}</span></button>
        </div>

        <div className="exchange-section-heading">
          <div>
            <h2>{activeView === 'installed' ? 'Apps in your organization' : 'Explore the marketplace'}</h2>
            <p>{activeView === 'installed' ? 'Review app access and manage installations.' : 'Curated extensions for your team and your workflows.'}</p>
          </div>
          <div className="exchange-trust-note"><BadgeCheck size={16} /> Review access before installing</div>
        </div>

        <div className="exchange-category-row" aria-label="Filter by category">
          {categories.map((category) => (
            <button key={category} className={activeCategory === category ? 'active' : ''} onClick={() => setActiveCategory(category)}>{category}</button>
          ))}
        </div>

        {activeView === 'discover' && activeCategory === 'All apps' && !search && (
          <section className="exchange-featured">
            <div className="exchange-featured-title"><Star size={14} /> FEATURED THIS WEEK</div>
            {marketplaceApps.filter((app) => app.featured).map((app) => {
              const Icon = app.icon;
              return (
                <article className="exchange-featured-card" key={app.id}>
                  <button className={`exchange-app-mark ${app.color}`} onClick={() => setSelectedApp(app)} aria-label={`View ${app.name} details`}><Icon size={23} /></button>
                  <button className="exchange-featured-info" onClick={() => setSelectedApp(app)}>
                    <strong>{app.name}</strong><span>{app.publisher}</span><small>{app.description}</small>
                  </button>
                  <div className="exchange-featured-rating"><Star size={13} fill="currentColor" /> {app.rating} <span>({app.reviews})</span></div>
                  <button className={installedIds.has(app.id) ? 'btn exchange-installed-button' : 'btn btn-brand'} onClick={() => installedIds.has(app.id) ? setSelectedApp(app) : requestInstall(app)}>
                    {installedIds.has(app.id) ? <><Check size={14} /> Installed</> : 'View app'}
                  </button>
                </article>
              );
            })}
          </section>
        )}

        <div className="exchange-results-heading">
          <h3>{activeView === 'installed' ? 'Installed apps' : activeCategory === 'All apps' ? 'Popular with teams' : `${activeCategory} apps`}</h3>
          <span>{visibleApps.length} {visibleApps.length === 1 ? 'app' : 'apps'}</span>
        </div>
        {visibleApps.length ? (
          <div className="exchange-app-grid">
            {visibleApps.map((app) => {
              const Icon = app.icon;
              const isInstalled = installedIds.has(app.id);
              return (
                <article className="exchange-app-card" key={app.id}>
                  <div className="exchange-card-top">
                    <button className={`exchange-app-mark ${app.color}`} onClick={() => setSelectedApp(app)} aria-label={`View ${app.name} details`}><Icon size={23} /></button>
                    {isInstalled && <span className="exchange-installed-tag"><CheckCircle2 size={12} /> Installed</span>}
                    {!isInstalled && <span className="exchange-price">{app.price}</span>}
                  </div>
                  <button className="exchange-card-info" onClick={() => setSelectedApp(app)}>
                    <strong>{app.name}</strong><span>{app.publisher} <BadgeCheck size={12} /></span>
                    <p>{app.description}</p>
                  </button>
                  <div className="exchange-card-meta"><span><Star size={12} fill="currentColor" /> {app.rating} <small>({app.reviews})</small></span><span>{app.installs} installs</span></div>
                  <div className="exchange-card-footer">
                    <span className="exchange-category-label">{app.category}</span>
                    {isInstalled
                      ? <button className="btn btn-small" onClick={() => setSelectedApp(app)}>Manage</button>
                      : <button className="btn btn-brand btn-small" onClick={() => setSelectedApp(app)}>View app <ArrowRight size={12} /></button>}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="exchange-empty">
            <span><Search size={20} /></span>
            <strong>{activeView === 'installed' ? 'No installed apps match' : 'No apps found'}</strong>
            <p>{activeView === 'installed' ? 'Try a different category or search term.' : 'Try another search or choose a different category.'}</p>
            <button className="text-action" onClick={() => { setSearch(''); setActiveCategory('All apps'); }}>Clear filters <ArrowRight size={13} /></button>
          </div>
        )}

        <div className="exchange-safe-note"><LockKeyhole size={15} /><span><strong>Designed for safe package management.</strong> Access is reviewed before installation. Uninstalling an app never deletes your organization’s records.</span></div>
      </div>

      {selectedApp && (
        <div className="exchange-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedApp(null); }}>
          <section className="exchange-detail" role="dialog" aria-modal="true" aria-labelledby="exchange-detail-title">
            <button className="exchange-close" onClick={() => setSelectedApp(null)} aria-label="Close app details"><X size={18} /></button>
            <div className="exchange-detail-head">
              {(() => { const Icon = selectedApp.icon; return <span className={`exchange-app-mark ${selectedApp.color}`}><Icon size={26} /></span>; })()}
              <div><div className="exchange-detail-category">{selectedApp.category} · Version {selectedApp.version}</div><h2 id="exchange-detail-title">{selectedApp.name}</h2><div className="exchange-detail-publisher">{selectedApp.publisher} <BadgeCheck size={13} /></div></div>
            </div>
            <div className="exchange-detail-rating"><Star size={14} fill="currentColor" /> <strong>{selectedApp.rating}</strong> ({selectedApp.reviews} reviews) <span>·</span> {selectedApp.installs} installs <span>·</span> {selectedApp.price}</div>
            <p className="exchange-detail-description">{selectedApp.description}</p>
            <div className="exchange-detail-columns">
              <div><h3>What you get</h3>{selectedApp.highlights.map((highlight) => <div className="exchange-detail-list-item" key={highlight}><CheckCircle2 size={14} />{highlight}</div>)}</div>
              <div><h3>Requested access</h3>{selectedApp.permissions.map((permission) => <div className="exchange-detail-list-item" key={permission}><LockKeyhole size={14} />{permission}</div>)}</div>
            </div>
            <div className="exchange-data-note"><Database size={17} /><span><strong>Data and uninstall behavior</strong>{selectedApp.dataFootprint} Uninstalling disables this package; it does not delete your organization’s records.</span></div>
            <div className="exchange-detail-footer">
              <span><Download size={14} /> {selectedApp.price}</span>
              {installedIds.has(selectedApp.id)
                ? <button className="btn" onClick={() => setDialog({ kind: 'uninstall', app: selectedApp })}>Uninstall</button>
                : <button className="btn btn-brand" onClick={() => requestInstall(selectedApp)}>Review and install <ArrowRight size={14} /></button>}
            </div>
          </section>
        </div>
      )}

      {dialog && (
        <div className="exchange-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
          <section className="exchange-confirm" role="dialog" aria-modal="true" aria-labelledby="exchange-confirm-title">
            <button className="exchange-close" onClick={() => setDialog(null)} aria-label="Close confirmation"><X size={18} /></button>
            {dialog.kind === 'install' ? (
              <>
                <span className="exchange-confirm-icon install"><PackageCheck size={22} /></span>
                <h2 id="exchange-confirm-title">Review installation</h2>
                <p className="exchange-confirm-copy"><strong>{dialog.app.name}</strong> will be added to this organization. Review the access requested before continuing.</p>
                <div className="exchange-install-scope"><h3>Who can access this app?</h3>
                  <label><input type="radio" name="install-scope" checked={installScope === 'admins'} onChange={() => setInstallScope('admins')} /><span><strong>Administrators only</strong><small>Recommended · grant access to other users later</small></span></label>
                  <label><input type="radio" name="install-scope" checked={installScope === 'all-users'} onChange={() => setInstallScope('all-users')} /><span><strong>All active users</strong><small>The app is available to active organization users</small></span></label>
                </div>
                <div className="exchange-confirm-safety"><ShieldCheck size={16} /><span>Installing will not modify or duplicate existing records. This UI preview does not contact an installation service.</span></div>
                <div className="exchange-confirm-actions"><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-brand" onClick={confirmInstall}>Confirm install</button></div>
              </>
            ) : (
              <>
                <span className="exchange-confirm-icon uninstall"><PackageCheck size={22} /></span>
                <h2 id="exchange-confirm-title">Uninstall {dialog.app.name}?</h2>
                <p className="exchange-confirm-copy">The app will no longer be available to users after uninstalling.</p>
                <div className="exchange-retain-note"><Database size={18} /><span><strong>Your data stays untouched.</strong> Uninstalling this app will not delete organization records or customer data.</span></div>
                <p className="exchange-confirm-muted">You can install it again later. Package uninstall behavior in this preview is represented by app access status only.</p>
                <div className="exchange-confirm-actions"><button className="btn" onClick={() => setDialog(null)}>Keep app</button><button className="btn btn-danger" onClick={confirmUninstall}>Uninstall app</button></div>
              </>
            )}
          </section>
        </div>
      )}
      <span className="exchange-external-hint"><ExternalLink size={11} /> Browse local preview catalog</span>
    </div>
  );
}
