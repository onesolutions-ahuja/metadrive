import { useEffect, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from 'lucide-react';
import ChecklistMultiSelect, { type ChecklistChoice } from './ChecklistMultiSelect';
import './AppManagerLayout.css';
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
  const setNavigationSelection = (type: 'Object' | 'App Page', selected: string[]) => {
    setDraft(current => {
      const navigationItems = type === 'Object' ? selected : current.navigationItems;
      const navigationPageApiNames = type === 'App Page' ? selected : current.navigationPageApiNames;
      return {...current, navigationItems, navigationPageApiNames,
        navigationOrder: reconcileNavigationOrder(navigationItems, navigationPageApiNames, current.navigationOrder)};
    });
    setError(''); setNotice('');
  };
  const objectChoices: ChecklistChoice[] = objects.map(object => ({
    value: object.apiName, label: object.pluralLabel,
    meta: object.kind + (objects.some(other => other.apiName !== object.apiName && other.label === object.label)
      ? ' · Same label' : '')
  }));
  const pageChoices: ChecklistChoice[] = pages.filter(page => page.pageType === 'App Page').map(page => ({
    value: page.apiName, label: page.label, meta: page.pageType + ' · ' + page.status,
    disabled: page.status !== 'Active'
  }));
  const displayObjectNames = draft.navigationItems.map(name =>
    objects.find(item => item.apiName === name)?.pluralLabel ?? name);
  const displayPageNames = draft.navigationPageApiNames.map(name =>
    pages.find(item => item.apiName === name)?.label ?? name);


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
      setNotice('App saved.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to save app.');
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
      setNotice('App deleted.');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Unable to delete app.');
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setCreating(false);
    const previous = apps.find(app => app.apiName === selectedApiName) ?? apps[0];
    setSelectedApiName(previous?.apiName ?? '');
    setDraft(previous ? appDraftFromMetadata(previous) : emptyApp());
    setError(''); setNotice('');
  };
  const startNewApp = () => {
    const original = apps.find(app => app.apiName === selectedApiName);
    if (original && JSON.stringify(appDraftFromMetadata(original)) !== JSON.stringify(draft)
      && !window.confirm('Discard unsaved app changes?')) return;
    setCreating(true); setSelectedApiName(''); setDraft(emptyApp());
    setError(''); setNotice('');
  };
  const openSetupWorkspace = (destination: SetupDestination) => {
    const original = apps.find(app => app.apiName === selectedApiName);
    const unsaved = creating || (original && JSON.stringify(appDraftFromMetadata(original)) !== JSON.stringify(draft));
    if (unsaved && !window.confirm('You have unsaved app changes. Leave App Manager without saving them?')) return;
    onOpenWorkspace?.(destination);
  };
  const steps = [
    {id:'app-basics',name:'Basic Info',subtitle:'Enter app details'},
    {id:'app-navigation',name:'Navigation Items',subtitle:'Choose records'},
    {id:'app-pages',name:'App Pages',subtitle:'Choose pages'},
    {id:'app-review',name:'Review & Create',subtitle:'Check and save'}
  ];

  return <div className="home-content app-manager-workspace">
    <header className="page-heading app-manager-top">
      <div>
        <div className="eyebrow">{embedded ? 'App Builder' : 'Platform Tools'}</div>
        <h1>{embedded ? 'App Settings' : 'App Manager'}</h1>
        <p>Create and configure applications using the existing Objects, Pages and navigation.</p>
      </div>
      {embedded
        ? <button className="btn" type="button" onClick={onClose}>Back to Page Builder</button>
        : !creating && <button className="btn btn-brand" type="button" onClick={startNewApp}><Plus size={14}/>New App</button>}
    </header>

    <nav className="app-manager-stepper" aria-label="Application setup steps">
      {steps.map((step, index) => <a href={'#' + step.id} key={step.id} className={'app-manager-step' + (index === 0 ? ' is-first' : '')}
        onClick={event => {
          event.preventDefault();
          document.getElementById(step.id)?.scrollIntoView({behavior:'smooth',block:'center'});
        }}>
        <span className="app-manager-step-number">{index + 1}</span>
        <span><strong>{step.name}</strong><small>{step.subtitle}</small></span>
      </a>)}
    </nav>

    <div className="app-manager-layout">
      <section className="surface permission-section app-manager app-manager-form-card" aria-label="App configuration">
        <div className="app-manager-card-intro">
          <h2>{creating ? 'Create New App' : 'App Details'}</h2>
          <p>{creating ? 'Enter the details and select what to include. All steps are on this page.' : 'Edit this app without changing its existing settings until you save.'}</p>
        </div>
        {!creating && <label className="form-label app-manager-switcher">App
          <select className="form-control" aria-label="Select app to edit" value={selectedApiName}
            onChange={event => {
              const original = apps.find(app => app.apiName === selectedApiName);
              if (original && JSON.stringify(appDraftFromMetadata(original)) !== JSON.stringify(draft)
                && !window.confirm('Discard unsaved app changes?')) return;
              setSelectedApiName(event.target.value); setError(''); setNotice('');
            }}>
            {apps.map(app => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}
          </select>
        </label>}
        <form onSubmit={event => void save(event)}>
          <div id="app-basics" className="app-manager-form-section">
            <div className="app-manager-section-title"><span>1</span><div><h3>Basic Information</h3><p>Enter the details for your application.</p></div></div>
            <PlatformPageSlot slotKey="identity">
              <div className="app-manager-identity-grid">
                {appManagerFieldDefinitions.map(definition => {
                  const field = definition.propertyKey as AppManagerFieldKey;
                  const disabled = field === 'apiName' && !creating;
                  const change = (next: string) => {
                    if (field === 'label') {
                      setDraft(current => ({
                        ...current, label: next,
                        apiName: creating && (!current.apiName || current.apiName === suggestAppApiName(current.label, apps))
                          ? suggestAppApiName(next, apps) : current.apiName
                      }));
                      setError(''); setNotice('');
                    } else update(field,next);
                  };
                  return <div className={'app-manager-identity-' + field} key={field}>
                    <AdminPropertyControl definition={definition} value={draft[field]}
                      disabled={disabled} onChange={change}/>
                    {field === 'apiName' && <small className="permission-help">
                      Developer names start with a letter and use only letters, digits and underscores.
                      AppExchange installation keys have separate rules.
                    </small>}
                  </div>;
                })}
              </div>
            </PlatformPageSlot>
          </div>

          <div className="app-manager-selectors">
            <section id="app-navigation" className="app-manager-form-section">
              <div className="app-manager-section-title"><span>2</span>
                <div><h3>Navigation Items</h3><p>Choose Objects to show in this app's Records selector.</p></div>
              </div>
              <PlatformPageSlot slotKey="navigation-items">
                <ChecklistMultiSelect label="Select navigation items" choices={objectChoices}
                  values={draft.navigationItems} onChange={values => setNavigationSelection('Object',values)}
                  placeholder="Select navigation items…" searchPlaceholder="Search Objects…"/>
              </PlatformPageSlot>
            </section>
            <section id="app-pages" className="app-manager-form-section">
              <div className="app-manager-section-title"><span>3</span>
                <div><h3>App Pages</h3><p>Choose active Pages to show as app navigation tabs.</p></div>
              </div>
              <PlatformPageSlot slotKey="pages">
                <ChecklistMultiSelect label="Select App Pages" choices={pageChoices}
                  values={draft.navigationPageApiNames} onChange={values => setNavigationSelection('App Page',values)}
                  placeholder="Select App Pages…" searchPlaceholder="Search Pages…"
                  emptyText="No Pages found. Publish an App Page using Page Builder."/>
              </PlatformPageSlot>
            </section>
          </div>
          <p className="app-manager-selector-note">Select at least one Object or App Page. Draft Pages cannot be added until activated.</p>

          <details className="app-manager-advanced">
            <summary>Additional settings <small>Navigation order, assigned Pages and utility bar</small></summary>
            <div className="app-manager-advanced-inner">
              <PlatformPageSlot slotKey="assignments"><fieldset className="app-manager-fieldset">
                <legend>Activated Pages for This App</legend>
                <p>Active Home and Record Pages assigned to the selected app.</p>
                <div className="app-manager-assigned-pages">
                  {assignedPages.map(page => <div className="app-manager-assigned-page" key={page.apiName}>
                    <span><strong>{page.label}</strong><small>{page.pageType} · {(page.activationAssignments ?? [])
                      .filter(assignment => assignment.appId === selectedApiName)
                      .map(assignment => assignment.scope).join(', ')}</small></span>
                    {embedded && onOpenPage && <button className="text-action" type="button" onClick={() => onOpenPage(page.apiName)}>Edit in Builder</button>}
                  </div>)}
                  {!assignedPages.length && <span className="permission-help">No active Home or Record Pages are assigned to this app.</span>}
                </div>
              </fieldset></PlatformPageSlot>
              <PlatformPageSlot slotKey="navigation-order"><fieldset className="app-manager-fieldset">
                <legend>Navigation Order</legend>
                <p>Set the order of selected Object tabs and App Pages.</p>
                <ol className="app-manager-navigation-order">
                  {navigationOrder.map((item,index) => {
                    const label = item.type === 'Object'
                      ? objects.find(object => object.apiName === item.apiName)?.pluralLabel ?? item.apiName
                      : pages.find(page => page.apiName === item.apiName)?.label ?? item.apiName;
                    return <li key={item.type + ':' + item.apiName}>
                      <span className="app-manager-navigation-label"><small>{item.type}</small><strong>{label}</strong></span>
                      <div className="app-manager-order-controls">
                        <button type="button" className="btn btn-small" aria-label={'Move ' + label + ' up'}
                          disabled={index === 0 || busy} onClick={() => moveNavigation(index,index - 1)}><ArrowUp size={15}/></button>
                        <button type="button" className="btn btn-small" aria-label={'Move ' + label + ' down'}
                          disabled={index === navigationOrder.length - 1 || busy} onClick={() => moveNavigation(index,index + 1)}><ArrowDown size={15}/></button>
                        <button type="button" className="btn btn-small" disabled={busy}
                          aria-label={'Remove ' + label + ' from navigation'} onClick={() => toggleNavigation(item.type,item.apiName,false)}>Remove</button>
                      </div>
                    </li>;
                  })}
                </ol>
                {!navigationOrder.length && <span className="permission-help">Select at least one Object or App Page above.</span>}
              </fieldset></PlatformPageSlot>
              <PlatformPageSlot slotKey="utility"><fieldset className="app-manager-fieldset">
                <legend>Utility Bar</legend>
                <div className="app-manager-checks">
                  {(['Notes','History'] as const).map(item => <label key={item}>
                    <input type="checkbox" checked={draft.utilityItems.includes(item)}
                      onChange={event => update('utilityItems',event.target.checked
                        ? [...draft.utilityItems,item]
                        : draft.utilityItems.filter(utility => utility !== item))}/>{item}
                  </label>)}
                </div>
              </fieldset></PlatformPageSlot>
            </div>
          </details>

          {error && <p className="form-error" role="alert">{error}</p>}
          {notice && <p className="form-success" role="status">{notice}</p>}
          <div id="app-review" className="app-manager-review-line">
            <strong>Ready to {creating ? 'create' : 'save'}?</strong>
            <span>{draft.navigationItems.length} navigation items · {draft.navigationPageApiNames.length} App Pages</span>
          </div>
          <PlatformPageSlot slotKey="actions"><div className="app-manager-actions">
            {creating && <button className="btn" type="button" disabled={busy} onClick={cancel}>Cancel</button>}
            {!creating && <button className="btn" type="button" disabled={busy || apps.length <= 1}
              onClick={() => void remove()}><Trash2 size={14}/>Delete App</button>}
            <button className="btn btn-brand" type="submit"
              disabled={busy || (!draft.navigationItems.length && !draft.navigationPageApiNames.length)}>
              {busy ? 'Saving…' : creating ? 'Create App' : 'Save Changes'}
              {!busy && <Save size={14}/>}
            </button>
          </div></PlatformPageSlot>
        </form>
      </section>

      <aside className="app-manager-help-column" aria-label="Application setup help">
        <section className="app-manager-side-card">
          <h2>What happens next?</h2>
          <ol className="app-manager-help-steps">
            <li><span>1</span><div><strong>Enter app details</strong><p>Choose a label, developer name, description and colour.</p></div></li>
            <li><span>2</span><div><strong>Select navigation items</strong><p>Choose Objects for the app's Records selector.</p></div></li>
            <li><span>3</span><div><strong>Select App Pages</strong><p>Add active Pages to your app navigation.</p></div></li>
            <li><span>4</span><div><strong>Review and create</strong><p>Check your selections and save the app.</p></div></li>
          </ol>
          <p className="app-manager-help-tip">You can select several options inside each searchable dropdown.</p>
        </section>

        <section className="app-manager-side-card app-manager-selection-summary">
          <h2>Your selection</h2>
          <div><strong>{draft.navigationItems.length} navigation items</strong>
            <p>{displayObjectNames.join(', ') || 'No Objects selected'}</p></div>
          <div><strong>{draft.navigationPageApiNames.length} App Pages</strong>
            <p>{displayPageNames.join(', ') || 'No App Pages selected'}</p></div>
        </section>

        <details className="app-manager-readiness">
          <summary>Application setup review <span>Configuration and dependency checks</span></summary>
          <AppSetupGuide app={draft} apps={apps} objects={objects} pages={pages}
            flows={flows} libraryComponents={libraryComponents} reports={reports} dashboards={dashboards}
            creating={creating} request={request} onOpenWorkspace={openSetupWorkspace}/>
        </details>
      </aside>
    </div>
  </div>;
}
