import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import AppSetupGuide from './AppSetupGuide';
import { suggestAppApiName, type SetupDestination } from './appSetupReadiness';
import { moveNavigationEntry, reconcileNavigationOrder } from './appNavigation';
import {PlatformPageSlot} from './PlatformPageSlot';
import {appManagerFieldDefinitions,validateAppManagerField,type AppManagerFieldKey} from './adminAppFieldMetadata';
import AdminPropertyControl from './AdminPropertyControl';
import type { DashboardMetadata, FlowDefinitionMetadata, LibraryComponentMetadata, LightningAppMetadata, LightningPageMetadata, ObjectMetadata, ReportMetadata } from './metadata';

type AppDraft = LightningAppMetadata;

const appDraftFromMetadata = (app: AppDraft): AppDraft => ({
  ...app,
  navigationItems: [...(app.navigationItems ?? [])],
  navigationPageApiNames: [...(app.navigationPageApiNames ?? [])],
  navigationOrder: reconcileNavigationOrder(app.navigationItems ?? [], app.navigationPageApiNames ?? [], app.navigationOrder ?? []),
  utilityItems: [...(app.utilityItems ?? [])],
  brandColor: app.brandColor || '#0176d3'
});

const emptyApp = (): AppDraft => ({
  apiName: '',
  label: '',
  description: '',
  navigationItems: [],
  navigationPageApiNames: [],
  navigationOrder: [],
  brandColor: '#0176d3',
  utilityItems: []
});

export default function AppManager({
  apps,
  objects,
  pages,
  flows = [],
  libraryComponents = [],
  reports = [],
  dashboards = [],
  onOpenWorkspace,
  request,
  onSave,
  onDelete,
  embedded = false,
  onClose,
  onOpenPage,
  initialSelectedApiName = '',
  onSelectedAppChange
}: {
  apps: LightningAppMetadata[];
  objects: ObjectMetadata[];
  pages: LightningPageMetadata[];
  flows?: FlowDefinitionMetadata[];
  libraryComponents?: LibraryComponentMetadata[];
  reports?: ReportMetadata[];
  dashboards?: DashboardMetadata[];
  onOpenWorkspace?: (destination: SetupDestination) => void;
  request?: <T>(path: string) => Promise<T>;
  onSave: (app: LightningAppMetadata, updating: boolean) => Promise<void>;
  onDelete: (apiName: string) => Promise<void>;
  embedded?: boolean;
  onClose?: () => void;
  onOpenPage?: (apiName: string) => void;
  initialSelectedApiName?: string;
  onSelectedAppChange?: (apiName: string) => void;
}) {
  const initialApp = apps.find((app) => app.apiName === initialSelectedApiName) ?? apps[0];
  const [selectedApiName, setSelectedApiName] = useState(initialApp?.apiName ?? '');
  const [draft, setDraft] = useState<AppDraft>(initialApp ? appDraftFromMetadata(initialApp) : emptyApp());
  const [navigationSearch, setNavigationSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const assignedPages = pages.filter((page) => page.status === 'Active'
    && (page.activationAssignments ?? []).some((assignment) => assignment.appId === selectedApiName));

  useEffect(() => {
    if (creating) return;
    const selected = apps.find((app) => app.apiName === selectedApiName) ?? apps[0];
    if (selected) {
      setSelectedApiName(selected.apiName);
      setDraft(appDraftFromMetadata(selected));
    } else {
      setSelectedApiName('');
      setDraft(emptyApp());
    }
  }, [apps, creating, selectedApiName]);
  useEffect(() => {
    if (embedded && selectedApiName) onSelectedAppChange?.(selectedApiName);
  }, [embedded, onSelectedAppChange, selectedApiName]);

  const update = <K extends keyof AppDraft>(key: K, value: AppDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setError('');
    setNotice('');
  };

  const toggleNavigation = (type: 'Object' | 'App Page', apiName: string, checked: boolean) => {
    setDraft((current) => {
      const key = type === 'Object' ? 'navigationItems' : 'navigationPageApiNames';
      const selected = checked
        ? [...new Set([...current[key], apiName])]
        : current[key].filter((item) => item !== apiName);
      const next: AppDraft = { ...current,
        navigationItems: type === 'Object' ? selected : current.navigationItems,
        navigationPageApiNames: type === 'App Page' ? selected : current.navigationPageApiNames
      };
      next.navigationOrder = reconcileNavigationOrder(next.navigationItems, next.navigationPageApiNames, current.navigationOrder);
      return next;
    });
    setError('');
    setNotice('');
  };
  const moveNavigation = (from: number, to: number) => {
    setDraft((current) => ({
      ...current,
      navigationOrder: moveNavigationEntry(
        reconcileNavigationOrder(current.navigationItems, current.navigationPageApiNames, current.navigationOrder),
        from, to
      )
    }));
    setNotice('');
  };
  const navigationOrder = reconcileNavigationOrder(draft.navigationItems, draft.navigationPageApiNames, draft.navigationOrder);
  const navigationMatches = (label: string, apiName: string) =>
    `${label} ${apiName}`.toLowerCase().includes(navigationSearch.trim().toLowerCase());

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const label = draft.label.trim();
      const apiName = creating
        ? (draft.apiName.trim() || label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, ''))
        : draft.apiName;
      if (creating && apps.some((app) => app.apiName.toLowerCase() === apiName.toLowerCase())) {
        throw new Error('This Developer Name is already in use. Choose another name.');
      }
      for (const field of appManagerFieldDefinitions) {
        const key = field.propertyKey as AppManagerFieldKey;
        const validation = validateAppManagerField(key,key==='apiName'?apiName:key==='label'?label:draft[key]);
        if (validation) throw new Error(validation);
      }
      if (!draft.navigationItems.length && !draft.navigationPageApiNames.length) throw new Error('Select at least one object or active App Page.');
      await onSave({ ...draft, apiName, label, navigationOrder }, !creating);
      setCreating(false);
      setSelectedApiName(apiName);
      setNotice('Lightning app saved.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save Lightning app.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!selectedApiName || !window.confirm(`Delete the ${draft.label} app?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await onDelete(selectedApiName);
      const remaining = apps.find((app) => app.apiName !== selectedApiName);
      setCreating(false);
      setSelectedApiName(remaining?.apiName ?? '');
      setDraft(remaining ? appDraftFromMetadata(remaining) : emptyApp());
      setNotice('Lightning app deleted.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to delete Lightning app.');
    } finally {
      setBusy(false);
    }
  };

  return <div className="home-content">
    <div className="page-heading">
      <div><div className="eyebrow">{embedded ? 'Lightning App Builder' : 'Platform Tools'}</div><h1>{embedded ? 'App Settings' : 'App Manager'}</h1><p>Create tenant apps and configure their navigation, branding, and utility bar.</p></div>
      {embedded
        ? <button className="btn" type="button" onClick={onClose}>Back to Page Builder</button>
        : <button className="btn btn-brand" type="button" onClick={() => {
        const original = apps.find((app) => app.apiName === selectedApiName);
        if (original && JSON.stringify(appDraftFromMetadata(original)) !== JSON.stringify(draft)
          && !window.confirm('Discard unsaved app changes?')) return;
        setCreating(true);
        setSelectedApiName('');
        setDraft(emptyApp());
        setError('');
        setNotice('');
      }}><Plus size={14} />New App</button>}
    </div>
    <AppSetupGuide app={draft} apps={apps} objects={objects} pages={pages}
      flows={flows} libraryComponents={libraryComponents} reports={reports} dashboards={dashboards}
      creating={creating} onOpenWorkspace={onOpenWorkspace} request={request}/>
    <section className="surface permission-section app-manager">
      {!creating && <label className="form-label">Lightning App
        <select className="form-control" aria-label="Select app to edit" value={selectedApiName} onChange={(event) => {
          const original = apps.find((app) => app.apiName === selectedApiName);
          if (original && JSON.stringify(appDraftFromMetadata(original)) !== JSON.stringify(draft)
            && !window.confirm('Discard unsaved app changes?')) return;
          setSelectedApiName(event.target.value);
          setError('');
          setNotice('');
        }}>
          {apps.map((app) => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}
        </select>
      </label>}
      <form onSubmit={(event) => void save(event)}>
        <PlatformPageSlot slotKey="identity"><div className="permission-form-grid">
          {appManagerFieldDefinitions.map((definition) => {
            const field = definition.propertyKey as AppManagerFieldKey;
            const isDescription = field === 'description';
            const disabled = field === 'apiName' && !creating;
            const value = draft[field];
            const change = (next: string) => {
              if (field === 'label') {
                setDraft((current) => ({
                  ...current,label:next,
                  apiName: creating && (!current.apiName || current.apiName === suggestAppApiName(current.label, apps))
                    ? suggestAppApiName(next, apps) : current.apiName
                }));
                setError('');
                setNotice('');
              } else update(field,next);
            };
            return <div key={field}>
              <AdminPropertyControl definition={definition} value={value} disabled={disabled} onChange={change}/>
              {field === 'apiName' && <small className="permission-help">Lightning App developer names start with a letter and contain only letters, digits and underscores. An AppExchange installation key has separate rules.</small>}
            </div>;
          })}
        </div></PlatformPageSlot>
        <label className="form-label">Find navigation items
          <input className="form-control" type="search" aria-label="Search navigation items" placeholder="Find object or active App Page…" value={navigationSearch} onChange={(event) => setNavigationSearch(event.target.value)} />
        </label>
        <PlatformPageSlot slotKey="pages"><fieldset className="app-manager-fieldset">
          <legend>Lightning Pages</legend>
          <p>Active App Pages are available as navigation tabs in this app.</p>
          <div className="app-manager-checks">
            {pages.filter((page) => page.pageType === 'App Page'
              && navigationMatches(page.label, page.apiName)).map((page) => <label key={page.apiName}>
              <input type="checkbox" checked={draft.navigationPageApiNames.includes(page.apiName)}
                disabled={page.status !== 'Active'}
                onChange={(event) => toggleNavigation('App Page', page.apiName, event.target.checked)} />
              <span>{page.label} <small className="permission-help">{page.apiName} · {page.pageType} · {page.status}</small></span>
            </label>)}
            {!pages.some((page) => page.pageType === 'App Page' && page.status === 'Active') && <span className="permission-help">Activate an App Page in Lightning App Builder to add it here.</span>}
          </div>
        </fieldset></PlatformPageSlot>
        <PlatformPageSlot slotKey="assignments"><fieldset className="app-manager-fieldset">
          <legend>Activated Pages for This App</legend>
          <p>Active Home and Record Pages assigned to the selected app.</p>
          <div className="app-manager-assigned-pages">
            {assignedPages.map((page) => <div className="app-manager-assigned-page" key={page.apiName}>
              <span><strong>{page.label}</strong><small>{page.pageType} · {(page.activationAssignments ?? [])
                .filter((assignment) => assignment.appId === selectedApiName)
                .map((assignment) => assignment.scope)
                .join(', ')}</small></span>
              {embedded && onOpenPage && <button className="text-action" type="button" onClick={() => onOpenPage(page.apiName)}>Edit in Builder</button>}
            </div>)}
            {!assignedPages.length && <span className="permission-help">No active Home or Record Pages are assigned to this app.</span>}
          </div>
        </fieldset></PlatformPageSlot>
        <PlatformPageSlot slotKey="navigation-items"><fieldset className="app-manager-fieldset">
          <legend>Navigation Items</legend>
          <p>Select the objects available in this app's Records dropdown.</p>
          <div className="app-manager-checks">
            {objects.filter((object) => navigationMatches(object.pluralLabel, object.apiName)).map((object) => <label key={object.apiName}>
              <input type="checkbox" checked={draft.navigationItems.includes(object.apiName)}
                onChange={(event) => toggleNavigation('Object', object.apiName, event.target.checked)} />
              <span>{object.pluralLabel} <small className="permission-help">{object.apiName} · {object.kind}{objects.filter(item => item.label === object.label).length > 1 ? ' · Same label used by another object' : ''}</small></span>
            </label>)}
          </div>
        </fieldset></PlatformPageSlot>
        <PlatformPageSlot slotKey="navigation-order"><fieldset className="app-manager-fieldset">
          <legend>Navigation Order</legend>
          <p>Set the order of selected object tabs and App Pages. Objects appear in the Records selector; pages appear as workspace tabs.</p>
          <ol className="app-manager-navigation-order">
            {navigationOrder.map((item, index) => {
              const label = item.type === 'Object'
                ? objects.find((object) => object.apiName === item.apiName)?.pluralLabel ?? item.apiName
                : pages.find((page) => page.apiName === item.apiName)?.label ?? item.apiName;
              return <li key={`${item.type}:${item.apiName}`}>
                <span className="app-manager-navigation-label"><small>{item.type}</small><strong>{label}</strong></span>
                <div className="app-manager-order-controls">
                  <button type="button" className="btn btn-small" aria-label={`Move ${label} up`} title="Move up" disabled={index === 0 || busy}
                    onClick={() => moveNavigation(index, index - 1)}><ArrowUp size={15} /></button>
                  <button type="button" className="btn btn-small" aria-label={`Move ${label} down`} title="Move down" disabled={index === navigationOrder.length - 1 || busy}
                    onClick={() => moveNavigation(index, index + 1)}><ArrowDown size={15} /></button>
                  <button type="button" className="btn btn-small" aria-label={`Remove ${label} from navigation`} title="Remove"
                    disabled={busy} onClick={() => toggleNavigation(item.type, item.apiName, false)}>Remove</button>
                </div>
              </li>;
            })}
          </ol>
          {!navigationOrder.length && <span className="permission-help">Select at least one object or App Page above.</span>}
        </fieldset></PlatformPageSlot>
        <PlatformPageSlot slotKey="utility"><fieldset className="app-manager-fieldset">
          <legend>Utility Bar</legend>
          <div className="app-manager-checks">
            {(['Notes', 'History'] as const).map((item) => <label key={item}>
              <input type="checkbox" checked={draft.utilityItems.includes(item)} onChange={(event) => {
                const utilityItems = event.target.checked
                  ? [...draft.utilityItems, item]
                  : draft.utilityItems.filter((utility) => utility !== item);
                update('utilityItems', utilityItems);
              }} />
              {item}
            </label>)}
          </div>
        </fieldset></PlatformPageSlot>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-success" role="status">{notice}</p>}
        <PlatformPageSlot slotKey="actions"><div className="app-manager-actions">
          <button className="btn btn-brand" type="submit" disabled={busy || (!draft.navigationItems.length && !draft.navigationPageApiNames.length)}><Save size={14} />{busy ? 'Saving…' : 'Save'}</button>
          {creating && <button className="btn" type="button" disabled={busy} onClick={() => {
            setCreating(false); const first = apps[0]; setSelectedApiName(first?.apiName ?? '');
            setDraft(first ? appDraftFromMetadata(first) : emptyApp()); setError(''); setNotice('');
          }}>Cancel</button>}
          {!creating && <button className="btn" type="button" disabled={busy || apps.length <= 1} onClick={() => void remove()}><Trash2 size={14} />Delete App</button>}
        </div></PlatformPageSlot>
      </form>
    </section>
  </div>;
}
