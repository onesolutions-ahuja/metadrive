import { useEffect, useState, type FormEvent } from 'react';
import { Plus, Save, Trash2 } from 'lucide-react';
import type { LightningAppMetadata, LightningPageMetadata, ObjectMetadata } from './metadata';

type AppDraft = LightningAppMetadata;

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
  const [draft, setDraft] = useState<AppDraft>(initialApp ?? emptyApp());
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
      setDraft(selected);
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
      await onSave({ ...draft, apiName, label }, !creating);
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
      setDraft(remaining ?? emptyApp());
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
        setCreating(true);
        setSelectedApiName('');
        setDraft(emptyApp());
        setError('');
        setNotice('');
      }}><Plus size={14} />New App</button>}
    </div>
    <section className="surface permission-section app-manager">
      {!creating && <label className="form-label">Lightning App
        <select className="form-control" value={selectedApiName} onChange={(event) => setSelectedApiName(event.target.value)}>
          {apps.map((app) => <option key={app.apiName} value={app.apiName}>{app.label}</option>)}
        </select>
      </label>}
      <form onSubmit={(event) => void save(event)}>
        <div className="permission-form-grid">
          <label className="form-label">App Label
            <input className="form-control" required maxLength={80} value={draft.label} onChange={(event) => update('label', event.target.value)} />
          </label>
          <label className="form-label">Developer Name
            <input className="form-control" required disabled={!creating} pattern="[A-Za-z][A-Za-z0-9_]*" value={draft.apiName} onChange={(event) => update('apiName', event.target.value)} />
          </label>
          <label className="form-label">Brand Color
            <input className="form-control app-brand-color" type="color" value={draft.brandColor} onChange={(event) => update('brandColor', event.target.value)} />
          </label>
        </div>
        <label className="form-label">Description
          <textarea className="form-control" rows={2} maxLength={500} value={draft.description} onChange={(event) => update('description', event.target.value)} />
        </label>
        <fieldset className="app-manager-fieldset">
          <legend>Lightning Pages</legend>
          <p>Active App Pages are available as navigation tabs in this app.</p>
          <div className="app-manager-checks">
            {pages.filter((page) => page.pageType === 'App Page' && page.status === 'Active').map((page) => <label key={page.apiName}>
              <input type="checkbox" checked={draft.navigationPageApiNames.includes(page.apiName)} onChange={(event) => {
                const navigationPageApiNames = event.target.checked
                  ? [...draft.navigationPageApiNames, page.apiName]
                  : draft.navigationPageApiNames.filter((name) => name !== page.apiName);
                update('navigationPageApiNames', navigationPageApiNames);
              }} />
              {page.label}
            </label>)}
            {!pages.some((page) => page.pageType === 'App Page' && page.status === 'Active') && <span className="permission-help">Activate an App Page in Lightning App Builder to add it here.</span>}
          </div>
        </fieldset>
        <fieldset className="app-manager-fieldset">
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
        </fieldset>
        <fieldset className="app-manager-fieldset">
          <legend>Navigation Items</legend>
          <p>Select the objects available as workspace tabs in this app.</p>
          <div className="app-manager-checks">
            {objects.map((object) => <label key={object.apiName}>
              <input type="checkbox" checked={draft.navigationItems.includes(object.apiName)} onChange={(event) => {
                const navigationItems = event.target.checked
                  ? [...draft.navigationItems, object.apiName]
                  : draft.navigationItems.filter((name) => name !== object.apiName);
                update('navigationItems', navigationItems);
              }} />
              {object.pluralLabel}
            </label>)}
          </div>
        </fieldset>
        <fieldset className="app-manager-fieldset">
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
        </fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        {notice && <p className="form-success" role="status">{notice}</p>}
        <div className="app-manager-actions">
          <button className="btn btn-brand" type="submit" disabled={busy || !draft.navigationItems.length}><Save size={14} />{busy ? 'Saving…' : 'Save'}</button>
          {!creating && <button className="btn" type="button" disabled={busy || apps.length <= 1} onClick={() => void remove()}><Trash2 size={14} />Delete App</button>}
        </div>
      </form>
    </section>
  </div>;
}
